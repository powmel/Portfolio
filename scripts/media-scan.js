#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { scan } = require("./lib/media-catalog");

const root = path.resolve(__dirname, "..");
const sources = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const result = scan(root, sources);
console.log(`写真台帳を更新しました: ${result.catalog.length}枚 / ${result.proposals.length}日分の候補`);
console.log(`対象フォルダ: ${result.sources.join(", ")}`);
