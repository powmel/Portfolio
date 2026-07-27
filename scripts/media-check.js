#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadDailyPosts, readJson } = require("./lib/media-catalog");

const root = path.resolve(__dirname, "..");
const posts = new Set(loadDailyPosts(root).map((post) => post.date));
const sandbox = { window: {} };
const selectionFile = path.join(root, "data", "media-selections.js");
vm.runInNewContext(fs.readFileSync(selectionFile, "utf8"), sandbox, { filename: selectionFile });
const selections = sandbox.window.MEDIA_SELECTIONS || {};
const errors = [];

for (const [date, selection] of Object.entries(selections)) {
  if (!posts.has(date)) errors.push(`${date}: 対応するDaily Logがありません`);
  const items = Array.isArray(selection) ? selection : [selection];
  for (const item of items) {
    if (!item.src || !fs.existsSync(path.join(root, item.src))) errors.push(`${date}: 公開画像がありません`);
    if (!item.alt) errors.push(`${date}: altがありません`);
    if (!item.capturedAt) errors.push(`${date}: 撮影日時がありません`);
    if ("caption" in item) errors.push(`${date}: 公開projectionに説明文を含めないでください`);
  }
}

const catalog = readJson(path.join(root, ".local-media", "catalog.json"), { items: [] });
if (!Array.isArray(catalog.items)) errors.push("ローカル写真台帳の形式が不正です");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const count = Object.values(selections).reduce((total, value) => total + (Array.isArray(value) ? value.length : 1), 0);
console.log(`写真台帳チェック通過: 公開選択 ${count}枚`);
