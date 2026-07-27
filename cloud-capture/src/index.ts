import { createRemoteJWKSet, jwtVerify } from "jose";
import publicPosts from "./public-posts.json";

type JsonRecord = Record<string, unknown>;
type MediaRow = {
  id: string;
  sha256: string;
  object_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string;
  captured_date: string;
  uploaded_at: string;
  source: string;
};
type DraftRow = {
  date: string;
  note: string;
  source: "text" | "voice";
  publication_state: string;
  updated_at: string;
  version: number;
};
type DecisionRow = {
  date: string;
  action: "publish" | "none" | "pending";
  media_id: string | null;
  caption: string;
  alt: string;
  actor_email: string;
  updated_at: string;
  version: number;
};
type MediaDecisionRow = {
  media_id: string;
  date: string;
  action: "publish" | "reject" | "later" | "pending";
  caption: string;
  alt: string;
  actor_email: string;
  updated_at: string;
  version: number;
};
type SuggestionRow = { date: string; media_id: string; score: number; reasons_json: string };

const MAX_JSON_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_STREAM_IMAGE_BYTES = 95 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/x-adobe-dng", "image/dng"]);

function json(status: number, value: unknown): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function extensionFor(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/x-adobe-dng": "dng", "image/dng": "dng" } as Record<string, string>)[mime];
}

function normalizeImageMime(value: string, filename = ""): string {
  const mime = value.toLowerCase().split(";", 1)[0].trim();
  if (/\.dng$/i.test(filename) && (!mime || mime === "application/octet-stream")) return "image/x-adobe-dng";
  return mime;
}

function imageSignatureMatches(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mime === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (mime === "image/heic" || mime === "image/heif") {
    const brand = new TextDecoder().decode(bytes.slice(4, 32));
    return brand.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1|msf1/.test(brand);
  }
  if (mime === "image/x-adobe-dng" || mime === "image/dng") {
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
      || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a);
  }
  return false;
}

async function streamPrefix(stream: ReadableStream<Uint8Array>, length = 32): Promise<Uint8Array> {
  const reader = stream.getReader();
  const output = new Uint8Array(length);
  let offset = 0;
  try {
    while (offset < length) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, length - offset);
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return output.subarray(0, offset);
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function actorFor(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const authMode = String(env.AUTH_MODE);
  const configuredTeamDomain = String(env.TEAM_DOMAIN);
  const policyAudience = String(env.POLICY_AUD);
  if (authMode === "development") {
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error("Development authentication is local-only");
    return "local-development";
  }
  if (authMode !== "access" || !configuredTeamDomain || !policyAudience) throw new Error("Access authentication is not configured");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Cloudflare Access authentication is required");
  const teamDomain = configuredTeamDomain.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, { issuer: teamDomain, audience: policyAudience });
  if (typeof payload.email !== "string" || !payload.email) throw new Error("Authenticated email is missing");
  return payload.email;
}

async function readBody(request: Request): Promise<JsonRecord> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new TypeError("Content-Type must be application/json");
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 36 * 1024 * 1024) throw new RangeError("Request body is too large");
  return await request.json<JsonRecord>();
}

async function buildState(env: Env) {
  const [mediaResult, draftResult, decisionResult, mediaDecisionResult, suggestionResult] = await Promise.all([
    env.DB.prepare("SELECT * FROM media_items ORDER BY captured_at DESC LIMIT 1000").all<MediaRow>(),
    env.DB.prepare("SELECT * FROM daily_captures ORDER BY date DESC LIMIT 1000").all<DraftRow>(),
    env.DB.prepare("SELECT * FROM publication_decisions ORDER BY date DESC LIMIT 1000").all<DecisionRow>(),
    env.DB.prepare("SELECT * FROM media_decisions ORDER BY updated_at DESC LIMIT 3000").all<MediaDecisionRow>(),
    env.DB.prepare("SELECT * FROM media_suggestions ORDER BY date DESC, score DESC LIMIT 3000").all<SuggestionRow>()
  ]);
  const media = mediaResult.results;
  const drafts = Object.fromEntries(draftResult.results.map((row) => [row.date, {
    date: row.date,
    note: row.note,
    source: row.source,
    publicationState: row.publication_state,
    updatedAt: row.updated_at,
    version: row.version
  }]));
  const decisions = Object.fromEntries(decisionResult.results.map((row) => [row.date, {
    action: row.action,
    mediaId: row.media_id || "",
    caption: row.caption,
    alt: row.alt,
    updatedAt: row.updated_at,
    version: row.version
  }]));
  const mediaDecisions = Object.fromEntries(mediaDecisionResult.results.map((row) => [row.media_id, {
    action: row.action,
    mediaId: row.media_id,
    date: row.date,
    caption: row.caption,
    alt: row.alt,
    updatedAt: row.updated_at,
    version: row.version
  }]));
  const dates = new Set([...publicPosts.map((post) => post.date), ...Object.keys(drafts)]);
  const postByDate = new Map(publicPosts.map((post) => [post.date, post]));
  const suggestionsByDate = new Map<string, SuggestionRow[]>();
  for (const suggestion of suggestionResult.results) {
    const list = suggestionsByDate.get(suggestion.date) || [];
    list.push(suggestion);
    suggestionsByDate.set(suggestion.date, list);
  }
  const proposals = [...dates].sort().reverse().map((date) => {
    const post = postByDate.get(date);
    const draft = drafts[date];
    return {
      date,
      title: post?.title || "非公開の日記下書き",
      summary: post?.summary || draft?.note || "",
      tags: post?.tags || ["Private draft"],
      candidates: (suggestionsByDate.get(date) || []).slice(0, 8).map((item) => ({
        mediaId: item.media_id,
        score: item.score,
        reasons: JSON.parse(item.reasons_json) as string[]
      }))
    };
  });
  return {
    posts: publicPosts,
    catalog: {
      generatedAt: new Date().toISOString(),
      sources: ["Cloudflare R2 private originals"],
      items: media.map((row) => ({
        id: row.id,
        filename: row.filename,
        mime: row.mime_type,
        bytes: row.size_bytes,
        capturedAt: row.captured_at,
        date: row.captured_date,
        source: row.source
      }))
    },
    proposals: { generatedAt: new Date().toISOString(), items: proposals },
    decisions: { items: decisions, media: mediaDecisions },
    drafts: { items: drafts },
    capabilities: { cloud: true, folderScan: false, privateOriginals: true }
  };
}

async function saveDraft(request: Request, env: Env) {
  const body = await readBody(request);
  if (!validDate(body.date)) return json(400, { error: "実在する日付を選んでください" });
  const source = body.source === "voice" ? "voice" : "text";
  const note = safeText(body.note, 20_000);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO daily_captures (date, note, source, publication_state, updated_at, version)
    VALUES (?1, ?2, ?3, 'private_draft', ?4, 1)
    ON CONFLICT(date) DO UPDATE SET note = excluded.note, source = excluded.source,
      updated_at = excluded.updated_at, version = daily_captures.version + 1
  `).bind(body.date, note, source, updatedAt).run();
  const state = await buildState(env);
  return json(200, { ok: true, draft: state.drafts.items[body.date], state });
}

async function saveJsonUpload(request: Request, env: Env) {
  const body = await readBody(request);
  if (!validDate(body.date)) return json(400, { error: "実在する日付を選んでください" });
  const match = typeof body.dataURL === "string" && body.dataURL.match(/^data:(image\/(?:jpeg|png|webp|heic|heif|x-adobe-dng|dng));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match || !allowedMimeTypes.has(match[1].toLowerCase())) return json(415, { error: "JPEG、PNG、WebP、HEIC、DNGの写真を選んでください" });
  const mime = match[1].toLowerCase();
  if (match[2].length > Math.ceil(MAX_JSON_IMAGE_BYTES * 4 / 3) + 4) return json(413, { error: "この送信方式では写真は1枚25MB以下にしてください" });
  const bytes = decodeBase64(match[2]);
  if (!bytes.length || bytes.byteLength > MAX_JSON_IMAGE_BYTES) return json(413, { error: "この送信方式では写真は1枚25MB以下にしてください" });
  if (!imageSignatureMatches(mime, bytes)) return json(415, { error: "画像の形式と内容が一致しません" });
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  const mediaId = sha256.slice(0, 16);
  const uploadId = safeText(body.uploadId, 160) || sha256;
  const receipt = await env.DB.prepare("SELECT media_id, sha256 FROM upload_receipts WHERE upload_id = ?1").bind(uploadId).first<{ media_id: string; sha256: string }>();
  if (receipt && receipt.sha256 !== sha256) return json(409, { error: "同じuploadIdで異なる写真は保存できません" });
  const existing = await env.DB.prepare("SELECT id FROM media_items WHERE sha256 = ?1").bind(sha256).first<{ id: string }>();
  if (receipt || existing) {
    const id = receipt?.media_id || existing?.id || mediaId;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO upload_receipts (upload_id, media_id, sha256, created_at) VALUES (?1, ?2, ?3, ?4)").bind(uploadId, id, sha256, now),
      env.DB.prepare("INSERT OR IGNORE INTO media_suggestions (date, media_id, score, reasons_json, generated_at) VALUES (?1, ?2, 100, ?3, ?4)").bind(body.date, id, JSON.stringify(["選択した日付と一致", "iPhoneから保存"]), now)
    ]);
    return json(200, { ok: true, saved: { id, date: body.date, duplicate: true }, state: await buildState(env) });
  }
  const extension = extensionFor(mime);
  const objectKey = `private/originals/${body.date.slice(0, 7)}/${mediaId}.${extension}`;
  const filename = safeText(body.filename, 160).replace(/[\\/]/g, "-") || `photo.${extension}`;
  const capturedAtCandidate = typeof body.capturedAt === "string" ? new Date(body.capturedAt) : null;
  const capturedAt = capturedAtCandidate && Number.isFinite(capturedAtCandidate.getTime()) ? capturedAtCandidate.toISOString() : `${body.date}T12:00:00.000Z`;
  const now = new Date().toISOString();
  await env.MEDIA.put(objectKey, bytes.buffer, {
    httpMetadata: { contentType: mime },
    customMetadata: { captureDate: body.date, mediaId }
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO media_items
      (id, sha256, object_key, filename, mime_type, size_bytes, captured_at, captured_date, uploaded_at, source)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'mobile')`
    ).bind(mediaId, sha256, objectKey, filename, mime, bytes.byteLength, capturedAt, body.date, now),
    env.DB.prepare("INSERT INTO upload_receipts (upload_id, media_id, sha256, created_at) VALUES (?1, ?2, ?3, ?4)").bind(uploadId, mediaId, sha256, now),
    env.DB.prepare("INSERT OR REPLACE INTO media_suggestions (date, media_id, score, reasons_json, generated_at) VALUES (?1, ?2, 100, ?3, ?4)").bind(body.date, mediaId, JSON.stringify(["選択した日付と一致", "iPhoneから保存"]), now)
  ]);
  return json(201, { ok: true, saved: { id: mediaId, date: body.date, duplicate: false }, state: await buildState(env) });
}

async function saveStreamUpload(request: Request, env: Env) {
  const date = request.headers.get("X-Capture-Date") || "";
  if (!validDate(date)) return json(400, { error: "実在する日付を選んでください" });
  const encodedFilename = request.headers.get("X-File-Name") || "";
  let decodedFilename = "";
  try { decodedFilename = decodeURIComponent(encodedFilename); } catch { return json(400, { error: "写真のファイル名が不正です" }); }
  const filename = safeText(decodedFilename, 160).replace(/[\\/]/g, "-");
  const mime = normalizeImageMime(request.headers.get("Content-Type") || "", filename);
  if (!allowedMimeTypes.has(mime)) return json(415, { error: "JPEG、PNG、WebP、HEIC、DNGの写真を選んでください" });
  const declaredSize = Number(request.headers.get("X-File-Size") || request.headers.get("Content-Length") || 0);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_STREAM_IMAGE_BYTES) {
    return json(413, { error: "写真は1枚95MB以下にしてください" });
  }
  if (!request.body) return json(400, { error: "写真データがありません" });
  const uploadId = safeText(request.headers.get("X-Upload-Id"), 160) || crypto.randomUUID();
  const extension = extensionFor(mime);
  const objectKey = `private/originals/${date.slice(0, 7)}/${crypto.randomUUID()}.${extension}`;
  const [storageStream, analysisStream] = request.body.tee();
  const [digestInput, signatureInput] = analysisStream.tee();
  const digestStream = new (crypto as Crypto & { DigestStream: typeof DigestStream }).DigestStream("SHA-256");
  const digestPromise = digestStream.digest;
  const [stored, , prefix, digest] = await Promise.all([
    env.MEDIA.put(objectKey, storageStream, {
      httpMetadata: { contentType: mime },
      customMetadata: { captureDate: date, uploadId, originalFilename: filename || `photo.${extension}` }
    }),
    digestInput.pipeTo(digestStream),
    streamPrefix(signatureInput),
    digestPromise
  ]);
  if (!stored || stored.size <= 0 || stored.size > MAX_STREAM_IMAGE_BYTES) {
    await env.MEDIA.delete(objectKey);
    return json(413, { error: "写真は1枚95MB以下にしてください" });
  }
  if (!imageSignatureMatches(mime, prefix)) {
    await env.MEDIA.delete(objectKey);
    return json(415, { error: "画像の形式と内容が一致しません" });
  }
  const sha256 = bytesToHex(digest);
  const mediaId = sha256.slice(0, 16);
  const receipt = await env.DB.prepare("SELECT media_id, sha256 FROM upload_receipts WHERE upload_id = ?1").bind(uploadId).first<{ media_id: string; sha256: string }>();
  if (receipt && receipt.sha256 !== sha256) {
    await env.MEDIA.delete(objectKey);
    return json(409, { error: "同じuploadIdで異なる写真は保存できません" });
  }
  const existing = await env.DB.prepare("SELECT id FROM media_items WHERE sha256 = ?1").bind(sha256).first<{ id: string }>();
  if (receipt || existing) {
    await env.MEDIA.delete(objectKey);
    const id = receipt?.media_id || existing?.id || mediaId;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO upload_receipts (upload_id, media_id, sha256, created_at) VALUES (?1, ?2, ?3, ?4)").bind(uploadId, id, sha256, now),
      env.DB.prepare("INSERT OR IGNORE INTO media_suggestions (date, media_id, score, reasons_json, generated_at) VALUES (?1, ?2, 100, ?3, ?4)").bind(date, id, JSON.stringify(["選択した日付と一致", "iPhoneから保存"]), now)
    ]);
    return json(200, { ok: true, saved: { id, date, duplicate: true }, state: await buildState(env) });
  }
  const capturedAtValue = request.headers.get("X-Captured-At") || "";
  const capturedAtCandidate = capturedAtValue ? new Date(capturedAtValue) : null;
  const capturedAt = capturedAtCandidate && Number.isFinite(capturedAtCandidate.getTime()) ? capturedAtCandidate.toISOString() : `${date}T12:00:00.000Z`;
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO media_items
        (id, sha256, object_key, filename, mime_type, size_bytes, captured_at, captured_date, uploaded_at, source)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'mobile')`
      ).bind(mediaId, sha256, objectKey, filename || `photo.${extension}`, mime, stored.size, capturedAt, date, now),
      env.DB.prepare("INSERT INTO upload_receipts (upload_id, media_id, sha256, created_at) VALUES (?1, ?2, ?3, ?4)").bind(uploadId, mediaId, sha256, now),
      env.DB.prepare("INSERT OR REPLACE INTO media_suggestions (date, media_id, score, reasons_json, generated_at) VALUES (?1, ?2, 100, ?3, ?4)").bind(date, mediaId, JSON.stringify(["選択した日付と一致", "iPhoneから保存"]), now)
    ]);
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    throw error;
  }
  return json(201, { ok: true, saved: { id: mediaId, date, duplicate: false }, state: await buildState(env) });
}

async function saveUpload(request: Request, env: Env) {
  return request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")
    ? saveJsonUpload(request, env)
    : saveStreamUpload(request, env);
}

async function saveDecision(request: Request, env: Env, actorEmail: string) {
  const body = await readBody(request);
  if (!validDate(body.date)) return json(400, { error: "実在する日付を選んでください" });
  if (!["publish", "reject", "later", "pending", "none", "undo"].includes(String(body.action))) return json(400, { error: "操作が不正です" });
  const action = body.action as "publish" | "reject" | "later" | "pending" | "none" | "undo";
  const mediaId = safeText(body.mediaId, 64);
  const caption = safeText(body.caption, 500);
  const alt = safeText(body.alt, 500) || caption;
  const updatedAt = new Date().toISOString();

  if (action !== "none") {
    if (!mediaId) return json(400, { error: "写真IDが必要です" });
    const media = await env.DB.prepare("SELECT id FROM media_items WHERE id = ?1").bind(mediaId).first();
    if (!media) return json(409, { error: "写真が台帳に存在しません" });
    const previous = await env.DB.prepare("SELECT * FROM media_decisions WHERE media_id = ?1").bind(mediaId).first<MediaDecisionRow>();
    if (action === "undo") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM media_decisions WHERE media_id = ?1").bind(mediaId),
        env.DB.prepare(`INSERT INTO decision_audit
          (id, date, old_value_json, new_value_json, actor_email, request_id, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(crypto.randomUUID(), body.date, previous ? JSON.stringify(previous) : null, JSON.stringify({ action: "pending", mediaId }), actorEmail, request.headers.get("Cf-Ray") || crypto.randomUUID(), updatedAt)
      ]);
      return json(200, await buildState(env));
    }
    const next = { date: body.date, action, mediaId, caption, alt, updatedAt };
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO media_decisions
        (media_id, date, action, caption, alt, actor_email, updated_at, version)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
        ON CONFLICT(media_id) DO UPDATE SET date = excluded.date, action = excluded.action,
          caption = excluded.caption, alt = excluded.alt, actor_email = excluded.actor_email,
          updated_at = excluded.updated_at, version = media_decisions.version + 1`
      ).bind(mediaId, body.date, action, caption, alt, actorEmail, updatedAt),
      env.DB.prepare(`INSERT INTO decision_audit
        (id, date, old_value_json, new_value_json, actor_email, request_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(crypto.randomUUID(), body.date, previous ? JSON.stringify(previous) : null, JSON.stringify(next), actorEmail, request.headers.get("Cf-Ray") || crypto.randomUUID(), updatedAt)
    ]);
    return json(200, await buildState(env));
  }

  const previous = await env.DB.prepare("SELECT * FROM publication_decisions WHERE date = ?1").bind(body.date).first<DecisionRow>();
  const legacyAction = "none";
  const next = { date: body.date, action: legacyAction, mediaId: "", caption: "", alt: "", updatedAt };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO publication_decisions
      (date, action, media_id, caption, alt, actor_email, updated_at, version)
      VALUES (?1, ?2, NULLIF(?3, ''), ?4, ?5, ?6, ?7, 1)
      ON CONFLICT(date) DO UPDATE SET action = excluded.action, media_id = excluded.media_id,
        caption = excluded.caption, alt = excluded.alt, actor_email = excluded.actor_email,
        updated_at = excluded.updated_at, version = publication_decisions.version + 1`
    ).bind(body.date, legacyAction, "", "", "", actorEmail, updatedAt),
    env.DB.prepare(`INSERT INTO decision_audit
      (id, date, old_value_json, new_value_json, actor_email, request_id, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(crypto.randomUUID(), body.date, previous ? JSON.stringify(previous) : null, JSON.stringify(next), actorEmail, request.headers.get("Cf-Ray") || crypto.randomUUID(), updatedAt)
  ]);
  return json(200, await buildState(env));
}

async function privateMedia(pathname: string, env: Env): Promise<Response> {
  const mediaId = pathname.split("/").pop() || "";
  if (!/^[a-f0-9]{16}$/.test(mediaId)) return json(404, { error: "写真が見つかりません" });
  const media = await env.DB.prepare("SELECT object_key, mime_type, size_bytes FROM media_items WHERE id = ?1").bind(mediaId).first<{ object_key: string; mime_type: string; size_bytes: number }>();
  if (!media) return json(404, { error: "写真が見つかりません" });
  const object = await env.MEDIA.get(media.object_key);
  if (!object) return json(404, { error: "写真が見つかりません" });
  return new Response(object.body, {
    headers: {
      "Content-Type": media.mime_type,
      "Content-Length": String(media.size_bytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'"
    }
  });
}

function secureAsset(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    let actorEmail: string;
    try {
      actorEmail = await actorFor(request, env);
    } catch {
      return json(403, { error: "Cloudflare Accessでの認証が必要です" });
    }
    const url = new URL(request.url);
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !originAllowed(request)) return json(403, { error: "別のサイトからの操作は拒否されました" });
    try {
      if (request.method === "GET" && url.pathname === "/api/state") return json(200, await buildState(env));
      if (request.method === "POST" && url.pathname === "/api/daily-draft") return await saveDraft(request, env);
      if (request.method === "POST" && url.pathname === "/api/mobile-upload") return await saveUpload(request, env);
      if (request.method === "POST" && url.pathname === "/api/decision") return await saveDecision(request, env, actorEmail);
      if (request.method === "POST" && url.pathname === "/api/scan") return json(200, await buildState(env));
      if (request.method === "GET" && url.pathname.startsWith("/__media/")) return await privateMedia(url.pathname, env);
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__media/")) return json(404, { error: "Not found" });
      if (url.pathname === "/") return Response.redirect(new URL("/admin/media.html", request.url), 302);
      return secureAsset(await env.ASSETS.fetch(request));
    } catch (error) {
      if (error instanceof TypeError) return json(415, { error: error.message });
      if (error instanceof RangeError) return json(413, { error: error.message });
      console.error(JSON.stringify({
        event: "request_failed",
        path: url.pathname,
        requestId: request.headers.get("Cf-Ray") || "local",
        error: error instanceof Error ? error.message : "unknown"
      }));
      return json(500, { error: "処理に失敗しました" });
    }
  }
} satisfies ExportedHandler<Env>;
