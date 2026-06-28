# Portfolio Agent Guide

## Daily Log Source Of Truth

- `data/daily-posts.js` is the canonical public Daily Log data source.
- New Daily Log entries must include structured `content` data.
- Do not hand-author or hand-edit `daily/YYYY-MM-DD.html`.
- Individual Daily Log HTML files are generated compatibility outputs for direct links and GitHub Pages.
- Run `npm run daily:build` after changing Daily Log data.
- Run `npm run daily:check` before commit or push.
- The Daily Log modal must render structured content directly from data. Do not make local `file://` viewing depend on `fetch()`.
- Legacy entries without structured `content` may continue using their existing HTML until migrated.

## Publication

- Keep private Taiki OS material out of this public repository.
- Publish only edited Level 0 content.
- Verify `daily.html`, the generated article, and mobile-width layout before push.
- Do not push public changes without Taiki's explicit approval.
