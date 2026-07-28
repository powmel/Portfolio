#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const run = spawnSync("swift", [
  "run", "-c", "release",
  "--package-path", path.join(root, "native", "apple-photos-bridge"),
  "apple-photos-bridge", "--",
  "--prepare-image", path.join(root, "images", "profile-main.jpg")
], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });

let result;
try {
  result = JSON.parse(String(run.stdout || "").trim());
} catch (_error) {
  console.error(run.stderr || run.stdout || "Bridge did not return preparation JSON.");
  process.exit(1);
}

if (result.status !== "prepared" || result.analysis?.aestheticScore !== 0.5) {
  console.error(`Expected AI-free prepared image, received ${JSON.stringify(result)}`);
  process.exit(1);
}
if (result.analysis.faceCount !== 0 || result.analysis.hasText !== false || result.analysis.labels?.length !== 0) {
  console.error("Default intake performed AI analysis before human flow confirmation.");
  process.exit(1);
}

console.log("Apple Photos AI-free intake test passed.");
