#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { ensureDir, readJson } = require("./lib/media-catalog");

const root = path.resolve(__dirname, "..");
const localDir = path.join(root, ".local-media");
const catalog = readJson(path.join(localDir, "catalog.json"), { items: [] }).items || [];
const decisionStore = readJson(path.join(localDir, "decisions.json"), { items: {}, media: {} });
const mediaDecisions = decisionStore.media || {};
const catalogById = new Map(catalog.map((item) => [item.id, item]));
const selections = {};
const previousPaths = new Set();
const selectionFile = path.join(root, "data", "media-selections.js");
if (fs.existsSync(selectionFile)) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(selectionFile, "utf8"), sandbox, { filename: selectionFile });
  for (const value of Object.values(sandbox.window.MEDIA_SELECTIONS || {})) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) if (entry?.src) previousPaths.add(entry.src);
  }
}

for (const decision of Object.values(mediaDecisions)) {
  if (!decision || decision.action !== "publish" || !decision.mediaId) continue;
  const media = catalogById.get(decision.mediaId);
  if (!media || !fs.existsSync(media.sourcePath)) continue;
  const date = decision.date || media.capturedDate || String(media.capturedAt).slice(0, 10);
  const relative = path.posix.join("images", "daily", date, `${media.id}.jpg`);
  const destination = path.join(root, ...relative.split("/"));
  ensureDir(path.dirname(destination));
  if (process.platform === "darwin") {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1800", media.sourcePath, "--out", destination], { stdio: "pipe" });
  } else if ([".jpg", ".jpeg"].includes(media.extension)) {
    fs.copyFileSync(media.sourcePath, destination);
  } else {
    throw new Error(`${media.sourcePath}: public derivative conversion requires macOS sips`);
  }
  selections[date] ||= [];
  selections[date].push({
    mediaId: media.id,
    src: relative,
    capturedAt: media.capturedAt,
    alt: decision.alt || `Daily Log ${date}の記録写真`
  });
  previousPaths.delete(relative);
}

for (const relative of previousPaths) {
  const target = path.join(root, ...relative.split("/"));
  if (target.startsWith(path.join(root, "images", "daily")) && fs.existsSync(target)) fs.unlinkSync(target);
}

const output = `window.MEDIA_SELECTIONS = ${JSON.stringify(selections, null, 2)};\n`;
fs.writeFileSync(selectionFile, output);
const count = Object.values(selections).reduce((total, items) => total + items.length, 0);
console.log(`公開写真の選択を反映しました: ${count}枚 / ${Object.keys(selections).length}日`);
