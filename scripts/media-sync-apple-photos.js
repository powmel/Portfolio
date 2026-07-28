#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { readJson, scan, writeJson } = require("./lib/media-catalog");

const root = path.resolve(__dirname, "..");
const localDir = path.join(root, ".local-media");
const outputDir = path.join(localDir, "apple-photos");
const configFile = path.join(localDir, "config.json");
const config = readJson(configFile, {});
const fixtureIndex = process.argv.indexOf("--fixture");
const fixture = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1] : "";
const since = process.argv.includes("--all")
  ? "2000-01-01T00:00:00Z"
  : config.applePhotosCursor || new Date(Date.now() - 21 * 86400000).toISOString();
let run;
let raw;
if (fixture) {
  run = spawnSync("swift", [
    "run", "-c", "release",
    "--package-path", path.join(root, "native", "apple-photos-bridge"),
    "apple-photos-bridge", "--",
    "--fixture", path.resolve(fixture)
  ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  raw = String(run.stdout || "").trim();
} else {
  const appPath = path.join(localDir, "bin", "Apple Photos Bridge.app");
  if (!fs.existsSync(appPath)) {
    const build = spawnSync(process.execPath, [path.join(root, "scripts", "build-apple-photos-bridge.js")], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    if (build.status !== 0) {
      console.error(build.stderr || build.stdout || "Apple Photos Bridge build failed.");
      process.exit(build.status || 1);
    }
  }
  const resultPath = path.join(localDir, "apple-photos-last-result.json");
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  run = spawnSync("open", [
    "-n", appPath, "--args",
    "--output", outputDir,
    "--since", since,
    "--limit", "120",
    "--result", resultPath
  ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout || `Apple Photos Bridge launch failed (${run.status}).`);
    process.exit(run.status || 1);
  }
  const waitArray = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 300000;
  while (!fs.existsSync(resultPath) && Date.now() < deadline) Atomics.wait(waitArray, 0, 0, 250);
  raw = fs.existsSync(resultPath) ? fs.readFileSync(resultPath, "utf8").trim() : "";
}
let result;
try {
  result = JSON.parse(raw);
} catch (_error) {
  console.error(run.stderr || raw || "Apple Photos Bridge did not return JSON.");
  process.exit(1);
}

if (result.status !== "authorized") {
  console.error(result.message || "Apple Photos access is required.");
  process.exit(2);
}

if (!fixture) {
  fs.mkdirSync(outputDir, { recursive: true });
  const sources = [...new Set([...(Array.isArray(config.sources) ? config.sources : []), outputDir])];
  scan(root, sources);
  writeJson(configFile, {
    ...readJson(configFile, {}),
    applePhotosCursor: result.newestCapturedAt || config.applePhotosCursor || since,
    applePhotosLastSyncAt: new Date().toISOString()
  });
}

console.log(`Apple Photos同期: ${result.exported}枚${fixture ? "（fixture）" : ""}`);
