"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readJson } = require("./media-catalog");

// Deliberately return counts and dates only, never photo identifiers or notes.
function mediaStatus(root) {
  const local = path.join(root, ".local-media");
  const config = readJson(path.join(local, "config.json"), {});
  const lastRun = readJson(path.join(local, "apple-photos-last-result.json"), {});
  const catalog = readJson(path.join(local, "catalog.json"), { items: [] });
  const decisions = readJson(path.join(local, "decisions.json"), { media: {} });
  const drafts = readJson(path.join(local, "daily-drafts.json"), { items: {} });
  const sandbox = { window: {} };
  for (const file of ["daily-posts.js", "media-selections.js"]) {
    const target = path.join(root, "data", file);
    if (fs.existsSync(target)) vm.runInNewContext(fs.readFileSync(target, "utf8"), sandbox, { timeout: 1000 });
  }
  const posts = new Set((sandbox.window.DAILY_POSTS || []).map(post => post.date));
  const selected = new Set(Object.values(sandbox.window.MEDIA_SELECTIONS || {}).flat().map(item => item.mediaId));
  const counts = { total: 0, pending: 0, approved: 0, awaitingBuild: 0, awaitingDiary: 0, private: 0, later: 0, drafts: Object.keys(drafts.items || {}).length };
  for (const item of catalog.items || []) {
    counts.total += 1;
    const decision = decisions.media?.[item.id];
    const action = decision?.action || "pending";
    if (action === "publish") {
      counts.approved += 1;
      if (!selected.has(item.id)) counts.awaitingBuild += 1;
      if (!posts.has(decision.date || item.capturedDate)) counts.awaitingDiary += 1;
    } else if (action === "reject") counts.private += 1;
    else if (action === "later") counts.later += 1;
    else counts.pending += 1;
  }
  const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  return {
    lastSyncAt: date(config.applePhotosLastSyncAt),
    syncStatus: ["authorized", "permission_required", "error"].includes(lastRun.status) ? lastRun.status : "unknown",
    counts,
    stage: counts.pending ? "review_photos" : counts.awaitingDiary || counts.drafts ? "write_diary" : counts.awaitingBuild ? "build_preview" : "ready",
    automaticDiary: false,
    automaticPublication: false,
    publicationStatus: "unverified"
  };
}
module.exports = { mediaStatus };
