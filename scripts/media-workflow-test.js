#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { applyMediaDecision, buildReviewQueue } = require("./lib/media-decisions");

const catalog = {
  items: [
    { id: "new", capturedAt: "2026-07-27T12:00:00Z" },
    { id: "old", capturedAt: "2026-07-26T12:00:00Z" }
  ]
};
const proposals = {
  items: [
    {
      date: "2026-07-27",
      title: "Today",
      candidates: [
        { mediaId: "new", score: 96, reasons: ["same day"], warnings: [] },
        { mediaId: "old", score: 72, reasons: ["one day"], warnings: ["face"] }
      ]
    },
    {
      date: "2026-07-26",
      title: "Yesterday",
      candidates: [{ mediaId: "new", score: 40, reasons: ["one day"], warnings: [] }]
    }
  ]
};

let store = applyMediaDecision({}, {
  action: "publish",
  mediaId: "new",
  date: "2026-07-27",
  alt: "record"
}, "2026-07-27T12:10:00Z");
assert.equal(store.media.new.action, "publish");
assert.equal(store.history.length, 1);

store = applyMediaDecision(store, {
  action: "reject",
  mediaId: "old",
  date: "2026-07-27"
}, "2026-07-27T12:11:00Z");
let review = buildReviewQueue(proposals, catalog, store);
assert.equal(review.queue.length, 2, "a photo appears only once even when suggested for multiple dates");
assert.equal(review.queue[0].mediaId, "new", "newest photo appears first");
assert.equal(review.counts.publish, 1);
assert.equal(review.counts.reject, 1);

store = applyMediaDecision(store, {
  action: "undo",
  mediaId: "old",
  date: "2026-07-27"
}, "2026-07-27T12:12:00Z");
review = buildReviewQueue(proposals, catalog, store);
assert.equal(review.counts.pending, 1);
assert.equal(review.counts.reject, 0);

console.log("Media workflow test passed: per-photo decisions -> deduplicated queue -> undo");
