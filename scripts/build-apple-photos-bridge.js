#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageDir = path.join(root, "native", "apple-photos-bridge");
const appDir = path.join(root, ".local-media", "bin", "Apple Photos Bridge.app");
const contents = path.join(appDir, "Contents");
const macos = path.join(contents, "MacOS");
const build = spawnSync("swift", ["build", "-c", "release", "--package-path", packageDir], {
  cwd: root,
  stdio: "inherit"
});
if (build.status !== 0) process.exit(build.status || 1);
fs.mkdirSync(macos, { recursive: true });
fs.copyFileSync(path.join(packageDir, ".build", "release", "apple-photos-bridge"), path.join(macos, "apple-photos-bridge"));
fs.copyFileSync(path.join(packageDir, "Info.plist"), path.join(contents, "Info.plist"));
fs.chmodSync(path.join(macos, "apple-photos-bridge"), 0o755);
const sign = spawnSync("codesign", ["--force", "--sign", "-", "--identifier", "dev.taiki.portfolio.apple-photos-bridge", appDir], {
  cwd: root,
  stdio: "inherit"
});
if (sign.status !== 0) process.exit(sign.status || 1);
console.log(appDir);

