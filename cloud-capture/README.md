# Taiki Photo Capture Cloud

Private, mobile-first photo capture and review for the Portfolio Daily workflow.
The Worker serves the existing admin UI, stores private records in D1, stores
private originals in Cloudflare R2, and requires Cloudflare Access
outside local development.

Production: `https://taiki-photo-capture.taiki-msw.workers.dev`
Cloudflare Access permits only `taiki.msw@gmail.com`; the Worker then validates
the Access JWT and application audience again before serving the UI or API.

## Local verification

```bash
npm install
npm run check
npm run dev
```

Open `http://127.0.0.1:8787/admin/media.html`. Local development is allowed only
on loopback. A deployed Worker configured with `AUTH_MODE=development` rejects
non-loopback requests.

## Production boundary

Before deployment:

1. Create D1 `taiki-photo-capture` and private R2 bucket `taiki-private-media`.
2. Create a Cloudflare Access self-hosted application for this Worker and an
   Allow policy restricted to Taiki's exact identity.
3. Set `AUTH_MODE=access`, `TEAM_DOMAIN=https://<team>.cloudflareaccess.com`, and
   `POLICY_AUD=<application audience tag>` as non-secret Worker variables.
4. Apply the D1 migration remotely, run a deploy dry-run, and inspect the diff.

R2 stores private originals without exposing a public bucket URL. The binding
remains named `MEDIA` so the browser API and D1 records stay storage-agnostic.
The mobile upload endpoint streams JPEG, PNG, WebP, HEIC/HEIF, and iPhone
ProRAW DNG directly to R2 without base64 expansion. One original may be up to
95 MiB, keeping it below the Workers request limit with room for headers.

The cloud decision endpoint records approval but does not publish to the public
Portfolio. Mac-side export remains a separate approval-backed step. Do not add
automatic Git push or public deployment here.

`NEEDS_REAL_DEVICE_CHECK`: iPhone Safari ProRAW selection and DNG/HEIC preview behavior,
Home Screen installation, and physical ergonomics must be checked on a real device.

Daily Capture currently stores a `private_draft`; it does not autonomously
publish or start the evening AI conversation. The intended next connection is
for the evening AI flow to load that private draft, organize the memo and photo
candidates, and produce a reviewable diary candidate. Human approval and the
Level 0 public projection remain separate gates.
