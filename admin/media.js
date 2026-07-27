"use strict";

const state = {
  data: null,
  filter: "pending",
  uploads: [],
  current: 0,
  queue: [],
  undo: [],
  dragging: false,
  pointerStart: null
};
const $ = (selector, root = document) => root.querySelector(selector);
const tokenParam = new URLSearchParams(location.search).get("token");
if (tokenParam) {
  sessionStorage.setItem("mediaAdminToken", tokenParam);
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete("token");
  history.replaceState({}, "", cleanUrl);
}
const accessToken = sessionStorage.getItem("mediaAdminToken") || "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "処理に失敗しました");
  return value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setStatus(text, error = false) {
  const node = $("#sync-status");
  node.textContent = text;
  node.classList.toggle("error", error);
}

function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function mediaFor(id) {
  return state.data?.catalog?.items?.find((item) => item.id === id);
}

function mediaDecision(id) {
  return state.data?.decisions?.media?.[id] || { action: "pending" };
}

function buildFallbackQueue() {
  const byMedia = new Map();
  for (const proposal of state.data?.proposals?.items || []) {
    for (const candidate of proposal.candidates || []) {
      const existing = byMedia.get(candidate.mediaId);
      if (existing && existing.score >= candidate.score) continue;
      byMedia.set(candidate.mediaId, {
        ...candidate,
        date: proposal.date,
        title: proposal.title,
        summary: proposal.summary,
        media: mediaFor(candidate.mediaId),
        decision: mediaDecision(candidate.mediaId)
      });
    }
  }
  return [...byMedia.values()].filter((item) => item.media);
}

function refreshQueue() {
  const source = Array.isArray(state.data?.reviewQueue) ? state.data.reviewQueue : buildFallbackQueue();
  state.queue = source.filter((item) => (item.decision?.action || "pending") === "pending");
  state.current = Math.min(state.current, Math.max(0, state.queue.length - 1));
}

function privateMediaUrl(id) {
  const url = new URL(`/__media/${id}`, location.origin);
  if (accessToken) url.searchParams.set("token", accessToken);
  return `${url.pathname}${url.search}`;
}

function formatCapturedAt(value) {
  return String(value || "").replace("T", " ").replace(/:\d{2}(?:\.\d+)?Z?$/, "");
}

function queueCounts() {
  if (state.data?.queueCounts) return state.data.queueCounts;
  const counts = { pending: 0, publish: 0, reject: 0, later: 0 };
  const source = Array.isArray(state.data?.reviewQueue) ? state.data.reviewQueue : buildFallbackQueue();
  for (const item of source) {
    const action = item.decision?.action || "pending";
    counts[action] = (counts[action] || 0) + 1;
  }
  return counts;
}

function renderSummary() {
  const counts = queueCounts();
  $("#photo-count").textContent = state.data.catalog.items.length;
  $("#proposal-count").textContent = state.data.proposals.items.filter((item) => item.candidates.length).length;
  $("#approved-count").textContent = counts.publish || 0;
  $("#pending-count").textContent = counts.pending || 0;
  $("#source-list").innerHTML = state.data.catalog.sources.map((source) => `<code>${escapeHtml(source)}</code>`).join("");
}

function resetCardTransform() {
  const card = $("#swipe-card");
  card.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease";
  card.style.transform = "";
  card.style.opacity = "";
  card.dataset.direction = "";
  setTimeout(() => { card.style.transition = ""; }, 230);
}

function renderSwipeDeck() {
  const item = state.queue[state.current];
  const card = $("#swipe-card");
  const empty = $("#swipe-empty");
  const counts = queueCounts();
  $("#swipe-position").textContent = item ? `${state.current + 1} / ${state.queue.length}` : "0 / 0";
  $("#swipe-pending-label").textContent = `未確認 ${counts.pending || 0}枚`;
  $("#swipe-undo").disabled = !state.undo.length;
  [$("#swipe-reject"), $("#swipe-later"), $("#swipe-publish")].forEach((button) => { button.disabled = !item; });

  if (!item) {
    card.hidden = true;
    empty.hidden = false;
    return;
  }

  card.hidden = false;
  empty.hidden = true;
  resetCardTransform();
  const media = item.media || mediaFor(item.mediaId);
  const image = $("#swipe-photo");
  const unavailable = $("#swipe-preview-unavailable");
  unavailable.hidden = true;
  image.hidden = false;
  image.src = privateMediaUrl(item.mediaId);
  image.alt = `${item.date}の写真候補`;
  image.onerror = () => {
    image.hidden = true;
    unavailable.hidden = false;
  };
  $("#swipe-captured-at").textContent = formatCapturedAt(media?.capturedAt || media?.capturedDate || item.date);
  $("#swipe-ai-score").textContent = `AI候補度 ${Math.max(0, Math.min(100, Math.round(item.score || 0)))}%`;
  $("#swipe-daily-title").textContent = item.title || `${item.date} Daily Log`;
  $("#swipe-reason").textContent = (item.reasons || []).slice(0, 2).join(" ・ ");
  const warnings = item.warnings || [];
  $("#swipe-warnings").innerHTML = warnings.length
    ? warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")
    : '<span class="safe">顔・目立つ文字の警告はありません</span>';
}

async function decide(action) {
  const item = state.queue[state.current];
  if (!item) return;
  const card = $("#swipe-card");
  const direction = action === "publish" ? 1 : action === "reject" ? -1 : 0;
  card.style.transition = "transform 260ms cubic-bezier(.4,0,.2,1), opacity 220ms ease";
  card.style.transform = direction
    ? `translate3d(${direction * 125}%, ${direction * 18}px, 0) rotate(${direction * 10}deg)`
    : "translate3d(0,-35%,0) scale(.94)";
  card.style.opacity = ".08";
  card.dataset.direction = action;
  setStatus("判断を保存中");
  try {
    const previous = { mediaId: item.mediaId, date: item.date, action };
    state.data = await api("/api/decision", {
      method: "POST",
      body: JSON.stringify({
        date: item.date,
        action,
        mediaId: item.mediaId,
        caption: "",
        alt: `${item.date}の記録写真`
      })
    });
    state.undo.push(previous);
    if (state.undo.length > 20) state.undo.shift();
    state.current = 0;
    refreshQueue();
    render();
    setStatus(action === "publish" ? "公開待ちへ保存しました" : action === "reject" ? "非公開で保存しました" : "あとで確認に移しました");
  } catch (error) {
    resetCardTransform();
    setStatus(error.message, true);
  }
}

async function undoLast() {
  const previous = state.undo.pop();
  if (!previous) return;
  try {
    setStatus("直前の判断を戻しています");
    state.data = await api("/api/decision", {
      method: "POST",
      body: JSON.stringify({ date: previous.date, action: "undo", mediaId: previous.mediaId })
    });
    state.current = 0;
    refreshQueue();
    render();
    setStatus("直前の判断を戻しました");
  } catch (error) {
    state.undo.push(previous);
    setStatus(error.message, true);
  }
}

function pointerDown(event) {
  if (!state.queue.length) return;
  state.dragging = true;
  state.pointerStart = { x: event.clientX, y: event.clientY };
  $("#swipe-card").setPointerCapture?.(event.pointerId);
}

function pointerMove(event) {
  if (!state.dragging || !state.pointerStart) return;
  const dx = event.clientX - state.pointerStart.x;
  const dy = event.clientY - state.pointerStart.y;
  const card = $("#swipe-card");
  card.style.transform = `translate3d(${dx}px,${dy * .18}px,0) rotate(${dx / 28}deg)`;
  card.dataset.direction = Math.abs(dx) > 35 ? (dx > 0 ? "publish" : "reject") : "";
}

function pointerUp(event) {
  if (!state.dragging || !state.pointerStart) return;
  const dx = event.clientX - state.pointerStart.x;
  state.dragging = false;
  state.pointerStart = null;
  if (Math.abs(dx) >= 82) decide(dx > 0 ? "publish" : "reject");
  else resetCardTransform();
}

function fileDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.replace(/^data:(?:application\/octet-stream)?;base64,/i, `data:${photoMime(file)};base64,`));
    };
    reader.onerror = () => reject(reader.error || new Error("写真を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function photoMime(file) {
  if (/\.dng$/i.test(file.name)) return "image/x-adobe-dng";
  if (/\.heif$/i.test(file.name)) return "image/heif";
  if (/\.heic$/i.test(file.name)) return "image/heic";
  return file.type || "application/octet-stream";
}

function uploadIdFor(file, date) {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${date}-${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
}

function fileSizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function renderUploadPreview() {
  const files = [...$("#mobile-photos").files];
  state.uploads = files.map((file, index) => state.uploads[index]?.name === file.name
    ? state.uploads[index]
    : { name: file.name, phase: "queued", label: "待機中", progress: "0%" });
  $("#photo-picker-label").classList.toggle("has-files", files.length > 0);
  $("#upload-preview").innerHTML = files.map((file, index) => {
    const upload = state.uploads[index];
    return `<span class="upload-item ${upload.phase === "queued" ? "" : `is-${upload.phase}`}" data-upload-index="${index}" style="--upload-progress:${upload.progress}">
      <span>${escapeHtml(file.name)}</span><small>${fileSizeLabel(file.size)}</small>
      <span class="upload-state">${escapeHtml(upload.label)}</span><span class="upload-progress">${escapeHtml(upload.progress)}</span>
    </span>`;
  }).join("");
}

function setUploadPhase(index, phase, label, progress) {
  if (!state.uploads[index]) return;
  state.uploads[index] = { ...state.uploads[index], phase, label, progress };
  const node = $(`[data-upload-index="${index}"]`);
  if (!node) return;
  node.classList.remove("is-uploading", "is-done", "is-error");
  if (phase !== "queued") node.classList.add(`is-${phase}`);
  node.style.setProperty("--upload-progress", progress);
  $(".upload-state", node).textContent = label;
}

async function uploadPhoto(file, date) {
  const uploadId = uploadIdFor(file, date);
  if (!state.data.capabilities?.cloud) {
    return api("/api/mobile-upload", {
      method: "POST",
      body: JSON.stringify({
        date,
        filename: file.name,
        dataURL: await fileDataURL(file),
        capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "",
        uploadId
      })
    });
  }
  const response = await fetch("/api/mobile-upload", {
    method: "POST",
    headers: {
      "Content-Type": photoMime(file),
      "X-Capture-Date": date,
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Size": String(file.size),
      "X-Captured-At": file.lastModified ? new Date(file.lastModified).toISOString() : "",
      "X-Upload-Id": uploadId,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: file
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "写真の保存に失敗しました");
  return value;
}

async function saveCapture(event) {
  event.preventDefault();
  const date = $("#capture-date").value || todayKey();
  const note = $("#daily-note").value.trim();
  const files = [...$("#mobile-photos").files];
  const status = $("#capture-status");
  const submit = $(".upload-submit");
  try {
    submit.disabled = true;
    submit.classList.add("is-uploading");
    state.data = (await api("/api/daily-draft", {
      method: "POST",
      body: JSON.stringify({ date, note, source: "text" })
    })).state;
    for (let index = 0; index < files.length; index += 1) {
      setUploadPhase(index, "uploading", "送信中", "68%");
      const result = await uploadPhoto(files[index], date);
      state.data = result.state;
      setUploadPhase(index, "done", "保存済み", "100%");
    }
    status.textContent = "非公開の下書きとして保存しました";
    $("#mobile-photos").value = "";
    state.uploads = [];
    refreshQueue();
    render();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    submit.disabled = false;
    submit.classList.remove("is-uploading");
  }
}

function renderLedger() {
  const list = $("#review-list");
  const source = Array.isArray(state.data?.reviewQueue) ? state.data.reviewQueue : buildFallbackQueue();
  const items = source.filter((item) => state.filter === "all" || (item.decision?.action || "pending") === state.filter);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><strong>該当する写真はありません</strong><span>表示条件を変えてください。</span></div>';
    return;
  }
  list.innerHTML = items.map((item) => {
    const action = item.decision?.action || "pending";
    const media = item.media || mediaFor(item.mediaId);
    const label = { pending: "未確認", publish: "公開待ち", reject: "非公開", later: "あとで" }[action] || action;
    return `<article class="ledger-row">
      <img src="${privateMediaUrl(item.mediaId)}" alt="" loading="lazy">
      <div><time>${escapeHtml(formatCapturedAt(media?.capturedAt || item.date))}</time><h3>${escapeHtml(item.title || item.date)}</h3><p>${escapeHtml((item.reasons || []).slice(0, 2).join(" ・ "))}</p></div>
      <span class="ledger-state" data-state="${escapeHtml(action)}">${escapeHtml(label)}</span>
    </article>`;
  }).join("");
}

function render() {
  const isCloud = state.data.capabilities?.cloud === true;
  document.querySelectorAll("[data-local-only]").forEach((node) => { node.hidden = isCloud; });
  $("#admin-mode").textContent = isCloud ? "PRIVATE CLOUD" : "LOCAL ADMIN";
  $("#admin-description").textContent = "AIが新着写真を候補にします。人間は公開する・しないをスワイプで決めるだけです。";
  renderSummary();
  renderSwipeDeck();
  renderLedger();
}

async function rescan(sources = []) {
  try {
    setStatus("写真を同期中");
    state.data = await api("/api/scan", { method: "POST", body: JSON.stringify({ sources }) });
    state.current = 0;
    refreshQueue();
    render();
    setStatus("新着候補を更新しました");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function init() {
  try {
    state.data = await api("/api/state");
    const date = todayKey();
    $("#capture-date").value = date;
    $("#daily-note").value = state.data.drafts.items[date]?.note || "";
    refreshQueue();
    render();
    setStatus("準備完了");
  } catch (error) {
    setStatus(error.message, true);
  }
}

$("#swipe-reject").addEventListener("click", () => decide("reject"));
$("#swipe-later").addEventListener("click", () => decide("later"));
$("#swipe-publish").addEventListener("click", () => decide("publish"));
$("#swipe-undo").addEventListener("click", undoLast);
$("#swipe-card").addEventListener("pointerdown", pointerDown);
$("#swipe-card").addEventListener("pointermove", pointerMove);
$("#swipe-card").addEventListener("pointerup", pointerUp);
$("#swipe-card").addEventListener("pointercancel", resetCardTransform);
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input,textarea,select")) return;
  if (event.key === "ArrowLeft") decide("reject");
  if (event.key === "ArrowRight") decide("publish");
  if (event.key === "ArrowUp") decide("later");
});
$("#filter").addEventListener("change", (event) => { state.filter = event.target.value; renderLedger(); });
$("#rescan").addEventListener("click", () => rescan());
$("#source-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("#source-path").value.trim();
  if (value) rescan([value]);
});
$("#mobile-photos").addEventListener("change", () => { state.uploads = []; renderUploadPreview(); });
$("#capture-form").addEventListener("submit", saveCapture);

init();
