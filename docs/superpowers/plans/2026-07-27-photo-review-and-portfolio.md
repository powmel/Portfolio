# Photo Review And Living Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic Apple Photos intake, swipe-only human review, delayed Daily Log publication, and a kinetic editorial Portfolio visual refresh.

**Architecture:** Extend the existing private media catalog with an Apple
PhotoKit adapter and local Vision analysis. Keep decisions private and
reversible, generate only approval-backed public projections, and render those
projections from the existing structured Daily Log source.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node.js, Swift PhotoKit/Vision,
Cloudflare Worker/D1/R2, GitHub Pages.

---

### Task 1: Lock the decision and publication contracts

**Files:**
- Modify: `scripts/lib/media-catalog.js`
- Modify: `scripts/media-admin-server.js`
- Modify: `cloud-capture/src/index.ts`
- Test: `cloud-capture/scripts/e2e-test.mjs`

- [ ] Add `reject`, `later`, `publish`, and undo-compatible audit records.
- [ ] Keep `publish` as an approval queue state and never deploy from the API.
- [ ] Expose ordered pending candidates and queue counts from `/api/state`.
- [ ] Verify local and cloud state transitions with fixture requests.

### Task 2: Add automatic Apple Photos intake

**Files:**
- Create: `native/apple-photos-bridge/Package.swift`
- Create: `native/apple-photos-bridge/Sources/ApplePhotosBridge/main.swift`
- Create: `scripts/media-sync-apple-photos.js`
- Modify: `package.json`
- Test: `native/apple-photos-bridge/Tests/fixtures/sample-assets.json`

- [ ] Build a PhotoKit command that lists recent assets after macOS permission.
- [ ] Export private review derivatives and stable source identifiers.
- [ ] Produce face, text, classification, capture-time, and dimension signals
      with Vision.
- [ ] Add a fixture mode that proves adapter ingestion without accessing the
      real Photos library.
- [ ] Add `npm run media:sync:apple` and reuse its last successful cursor.

### Task 3: Replace long-form review with a swipe deck

**Files:**
- Modify: `admin/media.html`
- Modify: `admin/media.css`
- Modify: `admin/media.js`
- Modify: `cloud-capture/scripts/build-assets.mjs`

- [ ] Render one candidate at a time with progress, AI reason, and warnings.
- [ ] Add pointer/touch left and right swipes.
- [ ] Add accessible buttons and keyboard equivalents.
- [ ] Add `later` and one-step undo.
- [ ] Keep the catalog/maintenance view behind a secondary tab.

### Task 4: Connect approval to Daily Log rendering

**Files:**
- Modify: `scripts/media-apply.js`
- Modify: `scripts/build-daily-site.js`
- Modify: `data/media-selections.js`
- Modify: `styles.css`
- Test: `scripts/media-check.js`

- [ ] Generate public derivatives only from queued `publish` decisions.
- [ ] Strip metadata and write only capture date/time in the public projection.
- [ ] Match selections to the structured post date.
- [ ] Render approved photos in the post modal and generated article.
- [ ] Remove a public projection on the next build when approval is reversed.

### Task 5: Create the kinetic editorial Portfolio

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `script.js`
- Modify: `daily.html`

- [ ] Add an oversized kinetic wordmark and moments marquee.
- [ ] Convert hero and section composition to asymmetric full-bleed photography.
- [ ] Use black, paper white, and signal orange with a grain texture.
- [ ] Add restrained scroll reveals and hover motion.
- [ ] Honor `prefers-reduced-motion` and preserve keyboard navigation.

### Task 6: Verify the whole loop and document operation

**Files:**
- Modify: `README.md`
- Modify: `docs/PHOTO_CAPTURE_ARCHITECTURE.md`

- [ ] Run `npm run media:check`.
- [ ] Run `npm run daily:check`.
- [ ] Run `npm run cloud:check`.
- [ ] Run the Apple bridge fixture test.
- [ ] Exercise swipe, undo, delayed apply, and removal in Chromium at phone and
      desktop widths.
- [ ] Inspect the public landing page and one generated Daily Log visually.
- [ ] Record the real macOS Photos permission edge without claiming it passed
      until the permission prompt is accepted.

