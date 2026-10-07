"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mediaStatus } = require("./lib/media-status");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-status-test-"));
function json(name, value) { fs.writeFileSync(path.join(root, ".local-media", name), JSON.stringify(value)); }
try {
  fs.mkdirSync(path.join(root, ".local-media")); fs.mkdirSync(path.join(root, "data"));
  json("config.json", { applePhotosLastSyncAt: "2026-10-07T04:38:00Z", secret: "SHOULD_NOT_APPEAR" });
  json("apple-photos-last-result.json", { status: "authorized", items: [{ sourceId: "SHOULD_NOT_APPEAR" }] });
  json("catalog.json", { items: [{ id: "a", capturedDate: "2026-10-07", sourcePath: "SHOULD_NOT_APPEAR" }, { id: "b", capturedDate: "2026-10-06" }, { id: "c", capturedDate: "2026-10-05" }] });
  json("decisions.json", { media: { a: { action: "publish", date: "2026-10-07", caption: "SHOULD_NOT_APPEAR" }, b: { action: "publish", date: "2026-10-06" } } });
  json("daily-drafts.json", { items: { "2026-10-07": { note: "SHOULD_NOT_APPEAR" } } });
  fs.writeFileSync(path.join(root, "data", "daily-posts.js"), 'window.DAILY_POSTS = [{date:"2026-10-06"}];');
  fs.writeFileSync(path.join(root, "data", "media-selections.js"), 'window.MEDIA_SELECTIONS = {"2026-10-06":[{mediaId:"b"}]};');
  const status = mediaStatus(root);
  assert.equal(status.counts.approved, 2); assert.equal(status.counts.awaitingDiary, 1);
  assert.equal(status.counts.awaitingBuild, 1); assert.equal(status.counts.pending, 1);
  assert.equal(status.automaticPublication, false); assert.equal(status.stage, "review_photos");
  assert.ok(!JSON.stringify(status).includes("SHOULD_NOT_APPEAR"));
  json("config.json", { applePhotosLastSyncAt: "secret-not-date" });
  assert.equal(mediaStatus(root).lastSyncAt, null);
  console.log("Media status fixture passed: sanitized state and remaining stages.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
