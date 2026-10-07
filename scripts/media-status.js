#!/usr/bin/env node
"use strict";
const path = require("node:path");
const { mediaStatus } = require("./lib/media-status");
const status = mediaStatus(path.resolve(__dirname, ".."));
if (process.argv.includes("--json")) console.log(JSON.stringify(status, null, 2));
else {
  const time = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) + " JST" : "未確認";
  console.log(`最終同期: ${time} / ${status.syncStatus}`);
  console.log(`未確認 ${status.counts.pending}枚 / 承認済み ${status.counts.approved}枚 / 日記未作成 ${status.counts.awaitingDiary}枚 / 下書き ${status.counts.drafts}日`);
  console.log("写真の取り込み後は、選択 → 日記作成 → 公開確認が必要です。自動日記作成・自動公開は未接続です。");
  console.log("次の一歩: npm run media:open で写真を1枚選ぶ。");
}
