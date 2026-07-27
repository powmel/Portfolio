#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { loadDailyPosts, mimeFor, readJson, scan, writeJson } = require("./lib/media-catalog");
const { applyMediaDecision, buildReviewQueue, normalizeStore } = require("./lib/media-decisions");

const root = path.resolve(__dirname, "..");
const localDir = path.join(root, ".local-media");
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const port = Number(argValue("--port") || process.env.PORT || 4173);
const host = argValue("--host") || process.env.MEDIA_ADMIN_HOST || "127.0.0.1";
const accessToken = process.env.MEDIA_ADMIN_TOKEN || "";

if (!["127.0.0.1", "localhost", "::1"].includes(host) && !accessToken) {
  console.error("iPhone/LAN向け起動には MEDIA_ADMIN_TOKEN が必要です。");
  process.exit(1);
}

function state() {
  const catalog = readJson(path.join(localDir, "catalog.json"), { items: [], sources: [] });
  const proposals = readJson(path.join(localDir, "proposals.json"), { items: [] });
  const decisions = normalizeStore(readJson(path.join(localDir, "decisions.json"), { items: {} }));
  const drafts = readJson(path.join(localDir, "daily-drafts.json"), { items: {} });
  const { queue: reviewQueue, counts: queueCounts } = buildReviewQueue(proposals, catalog, decisions);
  return {
    posts: loadDailyPosts(root),
    catalog,
    proposals,
    decisions,
    reviewQueue,
    queueCounts,
    drafts,
    capabilities: { cloud: false, folderScan: true, privateOriginals: true }
  };
}

function authorized(request, url) {
  if (!accessToken) return true;
  const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return bearer === accessToken || url.searchParams.get("token") === accessToken;
}

function safeFilename(value) {
  return path.basename(String(value || "photo.jpg")).replace(/[^A-Za-z0-9._-]/g, "-").slice(-120);
}

function dateKey(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value || "") ? value : new Date().toISOString().slice(0, 10);
}

function saveMobilePhoto(payload) {
  const date = dateKey(payload.date);
  const match = String(payload.dataURL || "").match(/^data:(image\/(?:jpeg|png|webp|heic|heif|x-adobe-dng|dng));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("JPEG、PNG、WebP、HEIC、DNGの写真を選んでください");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 95 * 1024 * 1024) throw new Error("写真は1枚95MB以下にしてください");
  const originalName = safeFilename(payload.filename);
  const extension = path.extname(originalName).toLowerCase() || `.${match[1].split("/")[1]}`;
  const stem = path.basename(originalName, extension) || "photo";
  const id = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const targetDir = path.join(localDir, "mobile-inbox", date.slice(0, 7));
  fs.mkdirSync(targetDir, { recursive: true });
  let target = path.join(targetDir, `${date}-${stem}-${id}${extension}`);
  fs.writeFileSync(target, buffer);
  if ([".heic", ".heif"].includes(extension) && process.platform === "darwin") {
    const converted = target.replace(/\.(heic|heif)$/i, ".jpg");
    execFileSync("sips", ["-s", "format", "jpeg", target, "--out", converted], { stdio: "pipe" });
    fs.unlinkSync(target);
    target = converted;
  }
  return { id, path: target, date };
}

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function body(request, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > maxBytes) {
        tooLarge = true;
        raw = "";
      }
    });
    request.on("end", () => {
      if (tooLarge) return reject(new Error("送信データが大きすぎます"));
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function staticFile(response, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const extension = path.extname(file).toLowerCase();
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  response.writeHead(200, { "Content-Type": `${types[extension] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if ((url.pathname.startsWith("/api/") || url.pathname.startsWith("/__media/")) && !authorized(request, url)) {
      return json(response, 401, { error: "認証が必要です" });
    }
    if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, state());
    if (request.method === "POST" && url.pathname === "/api/scan") {
      const payload = await body(request);
      const sources = Array.isArray(payload.sources) ? payload.sources.filter(Boolean) : [];
      scan(root, sources);
      return json(response, 200, state());
    }
    if (request.method === "POST" && url.pathname === "/api/mobile-upload") {
      const payload = await body(request, 130 * 1024 * 1024);
      const saved = saveMobilePhoto(payload);
      scan(root, []);
      return json(response, 201, { ok: true, saved, state: state() });
    }
    if (request.method === "POST" && url.pathname === "/api/daily-draft") {
      const payload = await body(request);
      const date = dateKey(payload.date);
      const draftsFile = path.join(localDir, "daily-drafts.json");
      const drafts = readJson(draftsFile, { items: {} });
      drafts.items[date] = {
        date,
        note: String(payload.note || "").trim(),
        source: payload.source === "voice" ? "voice" : "text",
        updatedAt: new Date().toISOString(),
        publicationState: "private_draft"
      };
      writeJson(draftsFile, drafts);
      return json(response, 200, { ok: true, draft: drafts.items[date], state: state() });
    }
    if (request.method === "POST" && url.pathname === "/api/decision") {
      const payload = await body(request);
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(payload.date || "")) return json(response, 400, { error: "日付が不正です" });
      if (!["publish", "reject", "later", "pending", "none", "undo"].includes(payload.action)) return json(response, 400, { error: "操作が不正です" });
      const decisionsFile = path.join(localDir, "decisions.json");
      let decisions = normalizeStore(readJson(decisionsFile, { items: {}, media: {}, history: [] }));
      const mediaId = String(payload.mediaId || "");
      if (payload.action === "none") {
        decisions.items[payload.date] = {
          action: "none",
          mediaId: "",
          caption: "",
          alt: "",
          updatedAt: new Date().toISOString()
        };
      } else {
        if (!mediaId || !(state().catalog.items || []).some((item) => item.id === mediaId)) {
          return json(response, 409, { error: "写真が台帳に存在しません" });
        }
        decisions = applyMediaDecision(decisions, {
          action: payload.action,
          mediaId,
          date: payload.date,
          caption: payload.caption || "",
          alt: payload.alt || ""
        });
      }
      writeJson(decisionsFile, decisions);
      return json(response, 200, state());
    }
    if (request.method === "POST" && url.pathname === "/api/apply") {
      execFileSync(process.execPath, [path.join(root, "scripts", "media-apply.js")], { cwd: root, stdio: "pipe" });
      execFileSync(process.execPath, [path.join(root, "scripts", "build-daily-site.js")], { cwd: root, stdio: "pipe" });
      return json(response, 200, { ok: true, state: state() });
    }
    if (request.method === "GET" && url.pathname.startsWith("/__media/")) {
      const id = url.pathname.split("/").pop();
      const media = (state().catalog.items || []).find((item) => item.id === id);
      if (!media || !fs.existsSync(media.sourcePath)) return json(response, 404, { error: "写真が見つかりません" });
      response.writeHead(200, { "Content-Type": mimeFor(media.sourcePath), "Cache-Control": "private, max-age=60" });
      return fs.createReadStream(media.sourcePath).pipe(response);
    }
    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/admin/media.html" });
      return response.end();
    }
    const pathname = url.pathname;
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || !staticFile(response, file)) return json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, 500, { error: error.message || "処理に失敗しました" });
  }
});

if (!fs.existsSync(path.join(localDir, "catalog.json"))) scan(root, []);
server.listen(port, host, () => {
  console.log(`写真管理画面: http://${host}:${port}/admin/media.html`);
  console.log("この画面はローカルでのみ動作し、承認した写真だけ公開用フォルダへコピーします。");
});
