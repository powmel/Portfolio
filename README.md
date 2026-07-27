# Taiki Misawa Portfolio

Static personal portfolio website for GitHub Pages.

## Stack

- Plain HTML/CSS/JavaScript (no build step)
- Designed for GitHub Pages project sites

## Local preview

Open `index.html` directly, or run a simple static server:

```bash
python -m http.server 8080
```

Then access `http://localhost:8080`.

## Photo catalog and Daily Log suggestions

The photo workflow is local-first. Original photos stay outside the public site,
and only images explicitly approved in the local admin screen are copied into
the public `images/daily/` tree.

### Normal operation: no upload

On this Mac, Apple Photos is the automatic source. Build/register the bridge,
then grant `Apple Photos Bridge` access once in macOS
**System Settings → Privacy & Security → Photos**:

```bash
npm run media:build:apple
npm run media:permission:apple
npm run media:sync:apple
```

After permission is granted, the installed LaunchAgent
`dev.taiki.portfolio.apple-photos-sync` checks for new iCloud-synchronized
photos every hour. Review derivatives, Vision analysis, source identifiers,
and decisions stay in `.local-media/`.

Open `http://127.0.0.1:4173/admin/media.html` and decide one photo at a time:

- swipe right: approve for the next Daily Log build;
- swipe left: keep private;
- swipe up or press `あとで`: postpone;
- press undo: reverse the most recent decision.

A swipe never deploys the Portfolio. `npm run daily:build` later creates
privacy-safe JPEG derivatives for approved items, associates them with the
matching Daily Log date, and renders only the capture date/time.

Start the local photo admin:

```bash
npm run media:admin
```

Open `http://127.0.0.1:4173/admin/media.html`. Folder scan remains available
for older exports and Google Drive archives. The scanner:

- indexes supported images and removes byte-identical duplicates;
- extracts a date from the filename or JPEG metadata, with file modification
  time as a clearly labeled fallback;
- matches photos to Daily Log dates and text signals;
- presents the same one-photo swipe queue;
- copies only approved images into the public site and writes
  `data/media-selections.js`.

Useful commands:

```bash
npm run media:scan -- "/absolute/path/to/photo folder"
npm run media:apply
npm run media:check
```

Private catalog data, source paths, and decisions live in `.local-media/` and
are ignored by Git. The browser-based admin is bound to `127.0.0.1` only.

### Manual fallback

The same screen retains a private Daily Capture form for exceptional cases. It
can save a rough daily note and import multiple images from the iOS photo
picker, camera, Google Photos Picker, or Files. Photos enter the same private catalog and suggestion
queue used by Mac folder scans.

Google Photos is not the automatic source: since March 31, 2025 its official
API requires a user-driven Picker for access to existing library content.
Apple Photos / iCloud sync therefore supplies the no-upload path.

To use it from iPhone, bind the server to a specific LAN or Tailscale address.
A token is mandatory outside loopback:

```bash
MEDIA_ADMIN_TOKEN='set-locally-do-not-commit' \
  npm run media:admin -- --host 192.168.x.x
```

Then open `http://192.168.x.x:4173/admin/media.html?token=...` once on iPhone.
The token is kept in session storage, never written into tracked site data.
See `docs/PHOTO_CAPTURE_ARCHITECTURE.md` for the iOS/macOS role split and the
future LifePilot integration boundary.

### Cloudflare版（外出先からの利用）

外出先から使うCloudflare版は `cloud-capture/` にあります。ローカルD1/R2での検証は次で実行します。

```bash
npm run cloud:install
npm run cloud:check
```

本番ではCloudflare Accessで管理画面全体を本人だけに制限し、WorkerでAccess JWTを再検証します。MVPの写真原本はprivate R2、日記下書き・提案・判断履歴はD1に保存されます。公開サイトへの反映は引き続きMac側の別工程です。
iPhoneのJPEG・HEIC/HEIF・ProRAW（DNG）はbase64化せずR2へストリーミングし、1枚95MiBまで扱います。保存したメモは非公開下書きであり、夜のAI対話へ自動投入・自動公開する処理はまだありません。将来は夜の対話が下書きと写真候補を読み込み、確認可能な日記候補を作る境界へ接続します。

## Edit points

- Main landing page sections are in `index.html`
- LP copy, identity cards, timeline, focus areas, project highlights, vision, and contact labels are in `site.config.js`
- Activities / Experience master data is in `site.config.js > activities`
  - Recommended fields per item: `slug`, `period`, `status`, `title_ja`, `title_en`, `detail_ja`, `detail_en`, `records_ja`, `records_en`, `coverImage`, `gallery`, `url`
- Daily Log list data is in `data/daily-posts.js`
- Daily Log article files live under `daily/`
- Daily Log operation details are in `README_DAILY_LOG.md`
- Profile photo path is `site.config.js > profileImage`
  - Current photo file: `images/profile-main.jpg`
- Hero background photo stream paths are in `site.config.js > heroStreamImages`
  - Current files: `images/moment-1.jpg` ... `images/moment-6.jpg`

## Activity image structure (admin-friendly)

Each activity can keep its own images in a dedicated folder:

```text
images/
  activities/
    gdg-launch/
      cover.png
      gallery-1.png
      gallery-2.png
    ai-local-research/
      cover.png
      gallery-1.png
      gallery-2.png
    ... (one folder per activity)
```

- `cover.png` is used in the small thumbnail shown inside the activity card.
- `gallery` image paths are shown in the activity detail modal after click.
- `status` supports `ongoing` and `completed`.

## Update social/contact links

Edit these fields in `site.config.js`:

- `links.github`
- `links.x`
- `links.linkedin`
- `links.email`

If a value is `"#"`, the UI shows it as a placeholder.

## Language switching

- Header includes a Japanese / English language switch.
- Default language: `site.config.js > defaultLanguage`
- The selected language is saved in browser local storage.

## GitHub Pages notes

- This repository now serves the site from the repository root (`/`).
- In GitHub settings, set Pages source to:
  - Branch: `main`
  - Folder: `/ (root)`

No Flutter build is required for deployment.

## Git dubious ownership fix (Windows/shared drive)

If `git add` fails with `detected dubious ownership`, run:

```bash
git config --global --add safe.directory S:/Cursor/Portfolio/Portfolio
```

Then run normal git commands again:

```bash
git add .
git commit -m "Update portfolio content and activity media"
git push origin main
```
