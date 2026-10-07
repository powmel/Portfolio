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
- Taiki has given standing approval to publish routine Daily Log entries after private Taiki OS capture and a Level 0 privacy edit. A separate per-day approval is not required.
- If Taiki says `非公開`, `記録だけ`, `公開しない`, or equivalent, do not add or push that day's public article.
- Non-Daily portfolio changes still require explicit approval.

## Visual identity and page structure

- Preserve the orange marquee, moving photo runway, bold hero photography, and orange/black visual identity unless Taiki explicitly requests changing them.
- Do not turn readability or information-architecture feedback into a wholesale visual redesign.
- Home is an entry point for recent activity. Use `activities.html` for work, `about.html` for biography/background, `future.html` for aspirations, and `daily.html` for the diary archive.
- Keep affiliations, organizer badges, and exchange-leadership captions out of the homepage hero. They belong in the relevant activity or biography.
- Keep static HTML fallback copy consistent with `site.config.js`. Verify navigation across pages and scoped contrast at narrow widths.
