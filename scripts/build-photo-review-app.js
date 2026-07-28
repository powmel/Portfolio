#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageDir = path.join(root, "native", "apple-photos-bridge");
const appDir = path.join(root, ".local-media", "bin", "Taiki Photo Review.app");
const contents = path.join(appDir, "Contents");
const macos = path.join(contents, "MacOS");
const build = spawnSync("swift", [
  "build", "-c", "release", "--package-path", packageDir, "--product", "photo-review-app"
], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status || 1);

fs.mkdirSync(macos, { recursive: true });
fs.copyFileSync(path.join(packageDir, ".build", "release", "photo-review-app"), path.join(macos, "photo-review-app"));
fs.copyFileSync(path.join(packageDir, "PhotoReviewInfo.plist"), path.join(contents, "Info.plist"));
fs.chmodSync(path.join(macos, "photo-review-app"), 0o755);

const identity = process.env.APPLE_PHOTOS_CODESIGN_IDENTITY
  || "Apple Development: taiki.msw@icloud.com (WPUSJ4B3B4)";
const sign = spawnSync("codesign", [
  "--force", "--sign", identity,
  "--identifier", "dev.taiki.portfolio.photo-review",
  "--options", "runtime", "--timestamp=none", appDir
], { cwd: root, stdio: "inherit" });
if (sign.status !== 0) process.exit(sign.status || 1);
console.log(appDir);
