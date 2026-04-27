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

## Edit points

- Main landing page sections are in `index.html`
- LP copy, identity cards, timeline, focus areas, project highlights, vision, and contact labels are in `site.config.js`
- Activities / Experience master data is in `site.config.js > activities`
  - Recommended fields per item: `slug`, `period`, `status`, `title_ja`, `title_en`, `detail_ja`, `detail_en`, `records_ja`, `records_en`, `coverImage`, `gallery`, `url`
- Daily Log list data is in `data/daily-posts.js`
- Daily Log article files live under `daily/`
- Daily Log operation details are in `README_DAILY_LOG.md`
- Profile photo path is `site.config.js > profileImage`
  - Current photo file: `images/profile-main.png`
- Hero background photo stream paths are in `site.config.js > heroStreamImages`
  - Current files: `images/moment-1.png` ... `images/moment-6.png`

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
