#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const image = path.join(root, "images", "profile-main.jpg");
const run = spawnSync("swift", [
  "run", "-c", "release",
  "--package-path", path.join(root, "native", "apple-photos-bridge"),
  "apple-photos-bridge", "--",
  "--analyze-image", image
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

let result;
try {
  result = JSON.parse(String(run.stdout || "").trim());
} catch (_error) {
  console.error(run.stderr || run.stdout || "Bridge did not return analysis JSON.");
  process.exit(1);
}

if (result.status !== "analyzed") {
  console.error(`Expected analyzed status, received ${result.status}: ${result.message || ""}`);
  process.exit(1);
}
if (!Number.isInteger(result.analysis?.faceCount) || typeof result.analysis?.hasText !== "boolean") {
  console.error("Analysis result is missing faceCount or hasText.");
  process.exit(1);
}

console.log("Apple Photos analysis test passed.");
