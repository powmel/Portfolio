# Daily Capture And Photo Review Architecture

## Decision

The primary daily workflow is mobile-first. iPhone is the normal Capture and Review Surface; Mac is the Bulk Intake and operational surface. Both use the same private date-scoped records. The public Portfolio receives only approved Level 0 projections.

## Placement In Taiki's System

```text
iPhone / LifePilot                    Mac
------------------                   ------------------------
text or voice note                   photo folder / export
PhotosPicker / camera                bulk scan + deduplication
single-day review                    wide review + maintenance
          \                          /
           \                        /
            Private Daily Capture service
            - Daily Capture
            - Media Item
            - Media Suggestion
            - Publication Decision
                         |
                         | approval-backed Level 0 projection
                         v
              Portfolio publisher / GitHub Pages
```

Taiki OS may retain durable private records and provenance, but it is not the interactive photo picker. LifePilot is the eventual mobile client because it already owns the vertical single-day plan, actual activity, reflection, conversation, and voice workflow. Portfolio remains the public renderer and publication boundary.

## Current Vertical Slice

The current implementation lives beside Portfolio so it can be exercised immediately:

- `admin/media.html` is a responsive Capture and Review Surface.
- `scripts/media-admin-server.js` is the temporary private capture service.
- `.local-media/daily-drafts.json` stores private Daily Captures.
- `.local-media/mobile-inbox/` stores iPhone-selected originals.
- `.local-media/catalog.json` and `proposals.json` are private derived indexes.
- `data/media-selections.js` is the public, approval-backed projection.
- `native/apple-photos-bridge/` is the stable PhotoKit/Vision source adapter.
- `dev.taiki.portfolio.apple-photos-sync` runs that adapter hourly as a local
  LaunchAgent after one macOS Photos permission grant.

The HTTP and data boundaries are intentionally compatible with a later move behind the LifePilot bridge. That move must preserve record IDs and decisions; the UI may change.

## iPhone And iPad Role

1. Open the Daily Capture surface from LifePilot's Today or Reflect flow.
2. Enter an unstructured note or dictate it.
3. Select multiple photos through the system photo picker or camera.
4. Upload JPEG/HEIC/HEIF or iPhone ProRAW DNG originals into the private inbox
   with a date association. Cloud uploads stream originals to R2 up to 95 MiB
   per file instead of expanding them as base64.
5. Review one automatically proposed photo at a time.
6. Swipe right to approve, left to reject, or up to postpone.
7. The decision waits for the next Daily Log build; it does not publish
   immediately.

The phone should not expose file paths, catalog internals, Git state, or publisher commands.

## macOS Role

1. Keep the private service running on the Mac that has access to the photo source.
2. Add large folders or photo exports once; subsequent scans reuse them.
3. Review many dates on a wide screen, correct weak metadata, and inspect duplicates.
4. Apply approved selections and run public-data checks.

The Mac remains the publisher because it holds the Portfolio checkout and can verify public output before push.

## Private API Contract

- `GET /api/state`: capture, media, suggestion, and decision read model.
- `POST /api/daily-draft`: save a private date-scoped note.
- `POST /api/mobile-upload`: add an iPhone-selected image to the private inbox.
- `POST /api/scan`: refresh catalog and suggestions from configured sources.
- `POST /api/decision`: record publish, no-photo, or pending.
- `GET /__media/:id`: authenticated private preview.

For LAN use, bind to a specific Mac LAN or Tailscale address and require `MEDIA_ADMIN_TOKEN`. The service refuses a non-loopback bind without a token. Originals and tokens must never enter the public repository.

## LifePilot Integration Point

The future native LifePilot client should add a `DailyCaptureService` beside `TaikiOSImportService`. Today/Reflect supplies the selected date and text/voice transcript; `PhotosPicker` supplies transferable image data. The service calls the same endpoints, caches drafts offline, and queues idempotent uploads until the bridge is reachable.

The Portfolio-specific publication projection must remain downstream. LifePilot may create a Publication Decision but must not push, deploy, or silently publish.

## Running On iPhone Over The Local Network

Loopback-only development:

```bash
npm run media:admin
```

LAN/Tailscale use requires a token and a specific host:

```bash
MEDIA_ADMIN_TOKEN='set-locally-do-not-commit' npm run media:admin -- --host 192.168.x.x
```

Open `http://192.168.x.x:4173/admin/media.html?token=...` once on iPhone. The page keeps the token only in session storage. Add the page to the Home Screen for a standalone Capture Surface.

## Native Permission Edge

The PhotoKit bridge and its fixture path are buildable and testable without
accessing the real library. The first real sync requires one explicit macOS
Photos permission grant for bundle
`dev.taiki.portfolio.apple-photos-bridge`. After that grant, hourly sync is
automatic. Safari photo-library/camera selection remains only a manual fallback.

The normal review surface is `Taiki Photo Review.app`, a signed local macOS app
that starts the loopback service and embeds the swipe UI. The Cloudflare
surface is optional remote access, not the canonical ledger. The current
verification phase disables Vision/AI during intake: every recent Apple Photos
item enters the review queue with neutral analysis metadata so intake and human
swiping can be validated independently.

## Cloud-ready MVP

`cloud-capture/` contains the always-on version of the same private service:

- Cloudflare Worker serves the mobile-first admin UI and compatible private API.
- D1 stores drafts, media metadata, suggestions, decisions, and decision audit.
- Cloudflare R2 stores private originals. The `MEDIA` binding keeps the browser
  API and D1 records independent from the storage implementation.
- Cloudflare Access is required in production and its JWT is verified again by the Worker.
- A deployed Worker accidentally left in development auth mode rejects non-loopback traffic.

The MVP is deployed at `https://taiki-photo-capture.taiki-msw.workers.dev`.
Cloudflare Access limits entry to Taiki's exact email identity, and the Worker
independently validates the signed Access JWT for the same application audience.

The cloud `publish` decision is still only a human approval record. It does not
create a public object, copy an original into the Portfolio, or push Git. Public
projection remains a later Mac-side export with privacy-safe image derivatives.

The daily memo is currently saved only as a private draft. The product direction
is for the evening AI conversation to load that draft and its photo candidates,
organize them into a diary candidate, and then request human review. That evening
handoff is the next integration boundary; it is not yet an automatic background
job, and saving a draft does not publish a Daily Log entry.
