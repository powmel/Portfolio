"use strict";

const crypto = require("node:crypto");

function normalizeStore(value = {}) {
  return {
    ...value,
    items: value.items && typeof value.items === "object" ? value.items : {},
    media: value.media && typeof value.media === "object" ? value.media : {},
    history: Array.isArray(value.history) ? value.history : []
  };
}

function buildReviewQueue(proposals, catalog, storeValue) {
  const store = normalizeStore(storeValue);
  const catalogById = new Map((catalog.items || []).map((item) => [item.id, item]));
  const byMedia = new Map();
  for (const proposal of proposals.items || []) {
    for (const candidate of proposal.candidates || []) {
      const current = byMedia.get(candidate.mediaId);
      if (current && current.score >= candidate.score) continue;
      byMedia.set(candidate.mediaId, {
        mediaId: candidate.mediaId,
        date: proposal.date,
        title: proposal.title,
        summary: proposal.summary,
        score: candidate.score,
        reasons: candidate.reasons || [],
        warnings: candidate.warnings || []
      });
    }
  }
  for (const media of catalog.items || []) {
    if (media.source !== "apple-photos" || byMedia.has(media.id)) continue;
    byMedia.set(media.id, {
      mediaId: media.id,
      date: media.capturedDate || String(media.capturedAt || "").slice(0, 10),
      title: "Apple Photos 新着",
      summary: "端末内へ自動流入した写真です。",
      score: 0,
      reasons: ["Apple Photosから自動流入"],
      warnings: []
    });
  }
  const queue = [...byMedia.values()]
    .map((item) => ({
      ...item,
      media: catalogById.get(item.mediaId),
      decision: store.media[item.mediaId] || { action: "pending" }
    }))
    .filter((item) => item.media)
    .sort((left, right) => String(right.media.capturedAt).localeCompare(String(left.media.capturedAt)) || right.score - left.score);
  const counts = queue.reduce((result, item) => {
    const action = item.decision.action || "pending";
    result[action] = (result[action] || 0) + 1;
    return result;
  }, { pending: 0, publish: 0, reject: 0, later: 0 });
  return { queue, counts };
}

function applyMediaDecision(storeValue, input, now = new Date().toISOString()) {
  const store = normalizeStore(storeValue);
  const mediaId = String(input.mediaId || "");
  if (!mediaId) throw new Error("写真IDが必要です");
  if (input.action === "undo") {
    const prior = [...store.history].reverse().find((event) => event.mediaId === mediaId && !event.undoneAt);
    if (!prior) return store;
    if (prior.previous) store.media[mediaId] = prior.previous;
    else delete store.media[mediaId];
    prior.undoneAt = now;
    return store;
  }
  if (!["publish", "reject", "later", "pending"].includes(input.action)) throw new Error("操作が不正です");
  const previous = store.media[mediaId] || null;
  const next = {
    action: input.action,
    mediaId,
    date: input.date,
    caption: input.caption || "",
    alt: input.alt || "",
    updatedAt: now
  };
  store.media[mediaId] = next;
  store.history.push({
    id: crypto.randomUUID(),
    mediaId,
    date: input.date,
    previous,
    next,
    createdAt: now
  });
  if (store.history.length > 2000) store.history = store.history.slice(-2000);
  return store;
}

module.exports = { applyMediaDecision, buildReviewQueue, normalizeStore };
