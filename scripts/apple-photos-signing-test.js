#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const app = path.resolve(__dirname, "..", ".local-media", "bin", "Apple Photos Bridge.app");
const run = spawnSync("codesign", ["-dv", "--verbose=3", app], { encoding: "utf8" });
const details = `${run.stdout || ""}\n${run.stderr || ""}`;
const entitlementsRun = spawnSync("codesign", ["-d", "--entitlements", ":-", app], { encoding: "utf8" });
const entitlements = `${entitlementsRun.stdout || ""}\n${entitlementsRun.stderr || ""}`;

if (run.status !== 0) {
  console.error(details.trim());
  process.exit(run.status || 1);
}
if (!/Authority=Apple Development: taiki\.msw@icloud\.com/.test(details)
    || !/TeamIdentifier=KVLJ8YD48H/.test(details)) {
  console.error("Apple Photos Bridge is not signed with Taiki's stable Apple Development identity.");
  process.exit(1);
}
if (!/com\.apple\.security\.personal-information\.photos-library/.test(entitlements)) {
  console.error("Apple Photos Bridge is missing the Photos Library entitlement.");
  process.exit(1);
}

console.log("Apple Photos signing test passed.");
