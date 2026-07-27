# Photo Review And Living Portfolio Design

Date: 2026-07-27
Status: approved for implementation

## Outcome

Taiki does not upload photos into the Portfolio workflow. New iPhone photos
already synchronized into Apple Photos become private candidates
automatically. The review surface presents one candidate at a time. A right
swipe records `publish`, a left swipe records `reject`, and an upward action
records `later`.

A swipe never deploys the public site. Approved decisions enter a reversible
publication queue. The next Daily Log build attaches approved photos to the
entry matching the capture date and publishes only a privacy-safe derivative
plus its capture date and time.

## Source Strategy

Apple Photos is the automatic source because PhotoKit can read a user-approved
iCloud-synchronized library on Taiki's Mac. Google Photos remains a secondary
Picker source because the current Google Photos API no longer permits an app
to continuously enumerate a user's complete library.

The source boundary is adapter-based:

- `folder`: existing local folders and exports;
- `apple-photos`: PhotoKit bridge for recent iCloud-synchronized assets;
- `mobile-upload`: existing manual emergency path;
- `google-picker`: future OAuth-backed user-selected fallback.

Private originals never enter the public repository.

## Candidate Analysis

The Apple bridge exports a review-size private derivative and metadata, then
uses macOS Vision to produce local signals:

- face count;
- text presence;
- broad image classifications;
- capture date and time;
- dimensions and source identifier.

The ranker combines those signals with the Daily Log date. Faces and detected
text become visible privacy warnings, not automatic permission. The human
decision remains authoritative.

## Review Experience

The default route is a focused swipe deck:

- one large photo;
- capture date and time;
- proposed Daily Log date;
- short AI reason and privacy warnings;
- progress through the queue;
- explicit left/right buttons as accessible alternatives;
- keyboard arrows on desktop;
- undo for the most recent decision.

The existing long-form catalog remains available as an operations view, but it
is not the normal daily workflow.

## Publication Model

Decisions are append-only audit events with a current projection. `publish`
means approved for the next build, not already public. `reject`, `later`, and
undo are reversible.

During the Daily Log build:

1. select approved media whose capture date matches the post date;
2. create a web-safe public derivative;
3. write the public selection projection;
4. render the photo inside the Daily Log article;
5. show capture date and time only;
6. leave unmatched or unapproved media private.

Removing approval causes the next build to remove the photo projection.

## Public Visual Direction

The Portfolio keeps Taiki's real photographs and existing content, but shifts
from a generic card-based portfolio to a kinetic editorial identity:

- oversized condensed display typography;
- black, paper-white, and signal orange;
- full-bleed photography with asymmetric crops;
- a moving moments strip and marquee typography;
- precise scroll reveals and reduced-motion support;
- no imitation of Vaundy's branding, logos, or exact layout.

The memorable idea is a living field notebook: photographs, daily movement,
research, and building activity feel like one continuous timeline.

## Security And Privacy

- Local services bind to `127.0.0.1` by default.
- Remote review remains behind Cloudflare Access.
- Originals, source paths, analysis, and rejected decisions stay private.
- Face/text warnings are shown before approval.
- No AI process can create a human approval.
- Public derivatives strip private metadata.

## Verification

- unit checks for swipe state transitions, undo, and publication queue;
- fixture-based Apple bridge output check without Photos permission;
- security refusal for unauthenticated non-loopback access;
- end-to-end decision to Daily Log rendering check;
- mobile and desktop browser interaction checks;
- full Daily Log, media, and cloud checks;
- visual inspection with normal and reduced motion.

