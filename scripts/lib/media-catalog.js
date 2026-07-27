"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".dng"]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function loadDailyPosts(root) {
  const file = path.join(root, "data", "daily-posts.js");
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return Array.isArray(sandbox.window.DAILY_POSTS) ? sandbox.window.DAILY_POSTS : [];
}

function walkImages(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(absolute, output);
    else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(absolute);
  }
  return output;
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function filenameDate(file) {
  const name = path.basename(file);
  const match = name.match(/(?:^|\D)(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function jpegExifDate(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 12 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return "";
  const text = buffer.toString("latin1");
  const match = text.match(/(20\d{2}):([01]\d):([0-3]\d)[ T]([0-2]\d):([0-5]\d):([0-5]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : "";
}

function dateTimeFromMtime(file) {
  const stat = fs.statSync(file);
  const local = new Date(stat.mtimeMs - stat.mtime.getTimezoneOffset() * 60000);
  return local.toISOString().replace("Z", "");
}

function publicPathFor(root, file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  return relative.startsWith("images/") ? relative : "";
}

function buildCatalog(root, sources) {
  const files = [...new Set(sources.flatMap((source) => walkImages(path.resolve(source))))].sort();
  const byHash = new Map();
  for (const file of files) {
    const hash = hashFile(file);
    if (byHash.has(hash)) {
      byHash.get(hash).duplicates.push(file);
      continue;
    }
    const sidecarFile = `${file}.json`;
    const sidecar = readJson(sidecarFile, {});
    const filenameCapturedAt = filenameDate(file);
    const exifCapturedAt = jpegExifDate(file);
    const capturedAt = sidecar.capturedAt || filenameCapturedAt || exifCapturedAt || dateTimeFromMtime(file);
    const capturedDate = String(capturedAt).slice(0, 10);
    const dateSource = sidecar.capturedAt ? "photokit" : filenameCapturedAt ? "filename" : exifCapturedAt ? "exif" : "mtime";
    const relativeParts = path.relative(root, file).split(path.sep);
    const activityIndex = relativeParts.indexOf("activities");
    byHash.set(hash, {
      id: hash.slice(0, 16),
      hash,
      sourcePath: file,
      publicPath: publicPathFor(root, file),
      filename: path.basename(file),
      extension: path.extname(file).toLowerCase(),
      capturedAt,
      capturedDate,
      dateSource,
      month: capturedDate.slice(0, 7),
      activitySlug: activityIndex >= 0 ? relativeParts[activityIndex + 1] || "" : "",
      bytes: fs.statSync(file).size,
      source: sidecar.source || "folder",
      sourceId: sidecar.sourceId || "",
      analysis: {
        faceCount: Number(sidecar.analysis?.faceCount || 0),
        hasText: Boolean(sidecar.analysis?.hasText),
        labels: Array.isArray(sidecar.analysis?.labels) ? sidecar.analysis.labels.slice(0, 5) : [],
        aestheticScore: Number(sidecar.analysis?.aestheticScore || 0)
      },
      duplicates: []
    });
  }
  return [...byHash.values()].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function dayDistance(a, b) {
  a = String(a || "").slice(0, 10);
  b = String(b || "").slice(0, 10);
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 9999;
  return Math.round(Math.abs(left - right) / 86400000);
}

function buildProposals(posts, catalog) {
  return posts.map((post) => {
    const postTokens = new Set(tokenize([post.title, post.summary, ...(post.tags || [])].join(" ")));
    const candidates = catalog.map((media) => {
      const distance = dayDistance(post.date, media.capturedDate || media.capturedAt);
      const mediaTokens = tokenize(`${media.filename} ${media.activitySlug} ${(media.analysis?.labels || []).join(" ")}`);
      const shared = mediaTokens.filter((token) => postTokens.has(token));
      let score = Math.max(0, 90 - distance * 22);
      if (media.dateSource === "mtime") score *= 0.45;
      score += shared.length * 12;
      if (media.publicPath) score += 3;
      score += Math.min(8, Math.round((media.analysis?.aestheticScore || 0) * 8));
      const eligible = media.dateSource === "mtime"
        ? distance <= 7
        : distance <= 14 || (distance <= 45 && shared.length > 0);
      return {
        mediaId: media.id,
        score: eligible ? Math.round(score) : 0,
        reasons: [
          distance === 0 ? "撮影日が記事日付と一致" : `${distance}日差`,
          media.dateSource === "mtime" ? "撮影日時は更新日時から推定" : `${media.dateSource}の日付を使用`,
          shared.length ? `共通語: ${shared.join(", ")}` : "共通語なし",
          media.analysis?.faceCount ? `人物の顔を${media.analysis.faceCount}件検出` : "顔の検出なし",
          media.analysis?.hasText ? "画像内に文字を検出" : "目立つ文字の検出なし"
        ],
        warnings: [
          ...(media.analysis?.faceCount ? ["人物が写っています。公開範囲を確認してください"] : []),
          ...(media.analysis?.hasText ? ["文字・画面・個人情報が写っていないか確認してください"] : [])
        ]
      };
    }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    return { date: post.date, title: post.title, summary: post.summary, tags: post.tags || [], candidates };
  });
}

function resolveSources(root, requested = []) {
  const localDir = path.join(root, ".local-media");
  const config = readJson(path.join(localDir, "config.json"), {});
  const configured = Array.isArray(config.sources) ? config.sources : [];
  const mobileInbox = path.join(localDir, "mobile-inbox");
  const selected = requested.length ? requested : configured.length ? configured : [path.join(root, "images")];
  const sources = fs.existsSync(mobileInbox) ? [...selected, mobileInbox] : selected;
  return [...new Set(sources.map((source) => path.resolve(source)).filter((source) => fs.existsSync(source)))];
}

function scan(root, requestedSources = []) {
  const localDir = path.join(root, ".local-media");
  const existingConfig = readJson(path.join(localDir, "config.json"), {});
  const sources = resolveSources(root, requestedSources);
  if (!sources.length) throw new Error("読み込める写真フォルダがありません。");
  const catalog = buildCatalog(root, sources);
  const publishedPosts = loadDailyPosts(root);
  const existingDates = new Set(publishedPosts.map((post) => post.date));
  const drafts = readJson(path.join(localDir, "daily-drafts.json"), { items: {} }).items || {};
  const draftPosts = Object.values(drafts)
    .filter((draft) => draft && draft.date && !existingDates.has(draft.date))
    .map((draft) => ({
      date: draft.date,
      title: "非公開の日記下書き",
      summary: draft.note || "",
      tags: ["Daily Capture"]
    }));
  const proposals = buildProposals([...publishedPosts, ...draftPosts], catalog);
  writeJson(path.join(localDir, "config.json"), { ...existingConfig, sources, updatedAt: new Date().toISOString() });
  writeJson(path.join(localDir, "catalog.json"), { generatedAt: new Date().toISOString(), sources, items: catalog });
  writeJson(path.join(localDir, "proposals.json"), { generatedAt: new Date().toISOString(), items: proposals });
  return { sources, catalog, proposals };
}

function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".heic" || extension === ".heif") return "image/heic";
  if (extension === ".dng") return "image/x-adobe-dng";
  return "image/jpeg";
}

module.exports = {
  buildCatalog,
  buildProposals,
  ensureDir,
  loadDailyPosts,
  mimeFor,
  readJson,
  scan,
  writeJson
};
