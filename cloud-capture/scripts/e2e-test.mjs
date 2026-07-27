import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 8791;
const base = `http://127.0.0.1:${port}`;
const migration = spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "taiki-photo-capture", "--local"], {
  stdio: "inherit",
  shell: false
});
if (migration.status !== 0) process.exit(migration.status || 1);

const server = spawn("npx", ["wrangler", "dev", "--local", "--port", String(port), "--var", "AUTH_MODE:development"], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: false
});
let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk; });
server.stderr.on("data", (chunk) => { logs += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/state`);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Worker did not start:\n${logs}`);
}

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", Origin: base, ...(options.headers || {}) },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function binaryUpload(path, bytes, headers) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Origin: base, ...headers },
    body: bytes
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(value)}`);
  return value;
}

try {
  await waitForServer();
  const date = "2099-12-28";
  const draft = await json("/api/daily-draft", {
    method: "POST",
    body: JSON.stringify({ date, note: "cloud e2e private note", source: "text" })
  });
  if (draft.draft.note !== "cloud e2e private note") throw new Error("draft was not saved");

  const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const uploadId = `e2e-${Date.now()}`;
  const payload = {
    date,
    filename: "e2e.png",
    dataURL: `data:image/png;base64,${onePixelPng}`,
    capturedAt: `${date}T12:00:00.000Z`,
    uploadId
  };
  const upload = await json("/api/mobile-upload", { method: "POST", body: JSON.stringify(payload) });
  const mediaId = upload.saved.id;
  const repeat = await json("/api/mobile-upload", { method: "POST", body: JSON.stringify(payload) });
  if (repeat.saved.id !== mediaId || repeat.saved.duplicate !== true) throw new Error("upload was not idempotent");

  const largeDng = Buffer.alloc(26 * 1024 * 1024);
  largeDng.set([0x49, 0x49, 0x2a, 0x00], 0);
  const dngUploadId = `dng-e2e-${Date.now()}`;
  const dngUpload = await binaryUpload("/api/mobile-upload", largeDng, {
    "Content-Type": "image/x-adobe-dng",
    "X-Capture-Date": date,
    "X-File-Name": encodeURIComponent("iPhone-ProRAW.dng"),
    "X-File-Size": String(largeDng.byteLength),
    "X-Captured-At": `${date}T13:00:00.000Z`,
    "X-Upload-Id": dngUploadId
  });
  const dngMediaId = dngUpload.saved.id;
  const dngItem = dngUpload.state.catalog.items.find((item) => item.id === dngMediaId);
  if (!dngItem || dngItem.mime !== "image/x-adobe-dng" || dngItem.bytes !== largeDng.byteLength) {
    throw new Error("large iPhone DNG was not stored correctly");
  }

  const state = await json("/api/state");
  const proposal = state.proposals.items.find((item) => item.date === date);
  if (!proposal?.candidates.some((item) => item.mediaId === mediaId)) throw new Error("photo suggestion missing");

  const decision = await json("/api/decision", {
    method: "POST",
    body: JSON.stringify({ date, action: "publish", mediaId, caption: "E2E", alt: "E2E" })
  });
  if (decision.decisions.media[mediaId]?.action !== "publish") throw new Error("per-media publish decision missing");
  const rejected = await json("/api/decision", {
    method: "POST",
    body: JSON.stringify({ date, action: "reject", mediaId })
  });
  if (rejected.decisions.media[mediaId]?.action !== "reject") throw new Error("reject decision missing");
  const undone = await json("/api/decision", {
    method: "POST",
    body: JSON.stringify({ date, action: "undo", mediaId })
  });
  if (undone.decisions.media[mediaId]) throw new Error("decision undo failed");

  const preview = await fetch(`${base}/__media/${mediaId}`);
  if (!preview.ok || preview.headers.get("cache-control") !== "private, no-store") throw new Error("private preview failed");
  const dngPreview = await fetch(`${base}/__media/${dngMediaId}`);
  if (!dngPreview.ok || dngPreview.headers.get("content-type") !== "image/x-adobe-dng") throw new Error("DNG private preview failed");

  const crossOrigin = await fetch(`${base}/api/daily-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ date, note: "blocked" })
  });
  if (crossOrigin.status !== 403) throw new Error("cross-origin mutation was not blocked");
  console.log("Cloud capture E2E passed: draft -> upload -> suggestion -> per-photo publish/reject/undo -> private preview");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill("SIGTERM");
}
