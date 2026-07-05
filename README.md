<p align="center">
  <img src="docs/logo.png" alt="Photo-Shot" width="150">
</p>

<h1 align="center">Photo-Shot</h1>

<p align="center">
  A mobile-first, installable (PWA) AI image studio: edit photos across many
  image models, or copy EXIF metadata between images, all from one small
  self-hosted app.
</p>

<p align="center">
  <img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca.svg">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6.svg">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5a0fc8.svg">
</p>

---

## Screenshots

<p align="center">
  <img src="docs/screenshot-editor.png" alt="Editor: multi-provider AI image editing" width="290">
  &nbsp;&nbsp;
  <img src="docs/screenshot-metadata.png" alt="EXIF metadata copier" width="290">
</p>

## Features

- **Multi-provider image editing.** One UI in front of Gemini (direct),
  WaveSpeed, and OpenRouter, with 14+ image models (Nano Banana 2 / Pro,
  Seedream, GPT Image, Grok, …).
- **Model-aware controls.** Each model exposes only its real aspect ratios,
  resolutions (2K/4K), multi-image limits, output formats and extras (quality,
  web/image search, OpenRouter FLEX), with a live per-image price estimate and
  the estimated output resolution in pixels.
- **Text-to-image, image-to-image and re-edit.** Up to 5 reference images,
  inline prompt templates, and a one-tap "edit this result again" loop.
- **Keep your results.** Download or share each generation (Web Share where
  available), copy the exact prompt used, and browse a shared history of the
  images you made — stored on the server and synced across your devices for 90
  days, with per-image delete.
- **Cost tracking.** A running spend overview at the top of History: lifetime
  total, this month / today, and a breakdown per provider and per model, backed
  by a persistent ledger that survives history cleanup and deletes.
- **EXIF metadata copier.** Copy full EXIF, GPS only, GPS + time, or a custom
  field set from a source JPEG onto a target image, with optional pre-clear and
  PNG to JPEG conversion.
- **Mobile-first PWA.** Installable, offline app shell, safe-area aware, no
  zoom for an app-like feel, HEIC uploads converted on the fly.
- **Self-hosted and private.** Keys stay on the server (see below); a single
  unlock password gates usage.

## Usage

> On first run the app asks for the unlock password (`APP_PASSWORD`). It is
> remembered for 90 days, so you rarely re-enter it. On mobile, use your
> browser's "Add to Home Screen" to install it as a standalone app.

### Edit an image

1. On the **Editor** tab (the default), optionally add up to 5 reference images
   with *Add Photo* (HEIC is converted automatically). Pure text-to-image models
   need no image.
2. **Describe the edit** in the prompt box, or pick a ready-made *style template*
   (upscale, cinematic, restore, style transfer, and more).
3. Choose a **Provider** (Gemini / WaveSpeed / OpenRouter) and a **Model**. The
   estimated price per image is shown next to each model name.
4. Set **Resolution** (2K/4K) and **Ratio** (or *Auto* to match your reference).
   The estimated output size in pixels and the price update live underneath.
   Extra **Options** appear for models that support them (quality, output format,
   web/image search, OpenRouter FLEX for roughly 50% cheaper but slower).
5. Tap **Generate**. When it finishes you can **Download**, **Share**, copy the
   prompt, or **Edit this image again** to keep iterating on the result.

To carry the source photo's GPS/time onto the output, enable *Keep Original
Metadata* (it appears once a reference image is added).

### Copy EXIF metadata

1. Switch to the **Metadata** tab.
2. Add a **Source** photo (the JPEG whose metadata you want) and a **Target**
   photo (the image that should receive it).
3. Pick **what to copy**: All EXIF, GPS only, GPS + Time, or a **Custom** field
   selection. Optionally pre-clear the target's metadata first, or force the
   output to JPEG.
4. Tap **Copy Metadata**, then download the result.

### History

The **History** tab keeps the images you generated, stored on the server and
synced across your devices for 90 days (older entries expire automatically). It
opens with a **spend overview**: your lifetime total, this month / today, and a
breakdown per provider and model. Delete a single image with its trash button,
or *Clear All History* to empty the list — your lifetime spend total is kept.

## How it works

The browser does **not** call the AI providers directly. nginx runs a small
server-side reverse proxy under `/api/<provider>/` that injects the provider API
keys, so the keys live **only on the server** and never reach the browser. Every
`/api` request must carry the unlock password (`APP_PASSWORD`), which nginx
verifies, so neither the models nor the keys are reachable without it. The rest
of the app is a static bundle that nginx serves.

```
Browser ──/api/gemini/…──► nginx (adds the key) ──► provider
        ◄── image ──────────────────────────────────┘
        password checked by nginx on every /api request
```

## Stack

- React 19 + Vite 8 (Rolldown) + TypeScript 6
- Tailwind CSS v4 (local build, no CDN)
- `vite-plugin-pwa` (installable, offline app shell)
- nginx (static serving + the `/api` proxy), built on `node:24-alpine`,
  deployed behind Traefik

## Repository layout

```
.
├── docker-compose.yml   # deploy: app (nginx) + optional Cloudflare tunnel
├── .env.example         # copy to .env (API keys, password, tunnel token)
├── docs/                # logo / docs assets
└── app/                 # the whole frontend + its build/runtime
    ├── Dockerfile       # multi-stage: node build → nginx
    ├── nginx.conf       # static serving + the /api proxy includes
    ├── docker/render-config.sh   # generates /config.js + the /api proxy at start
    ├── scripts/         # icon generator + master art
    ├── App.tsx, index.tsx, index.css, types.ts, config.ts
    └── components/  services/  public/
```

## Configuration

All configuration comes from environment variables. At container start,
[`app/docker/render-config.sh`](app/docker/render-config.sh) generates the nginx
`/api` proxy (with the keys injected server-side) plus a `/config.js` that only
tells the browser **which** providers are configured (booleans, never the keys).
Changing a key needs a container restart, no rebuild.

| Variable                 | Purpose                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| `GEMINI_API_KEY`         | Google Gemini (direct) image models                                 |
| `WAVESPEED_API_KEY`      | WaveSpeed models (Seedream, Nano Banana, GPT Image, Grok, …)        |
| `OPENROUTER_API_KEY`     | OpenRouter-routed models                                            |
| `APP_PASSWORD`           | Unlock password; nginx checks it on every `/api` call. The real access gate — **required**; the container refuses to start on an empty, well-known, or under-12-character value |
| `CLOUDFLARE_TUNNEL_TOKEN`| Optional: expose the app via a Cloudflare Tunnel (leave empty to disable) |

Copy [`.env.example`](.env.example) to `.env` and fill it in. Any unset provider
key simply disables that provider in the UI.

## Quick start (Docker)

```bash
cp .env.example .env     # then edit .env
docker compose up -d --build
```

The compose file assumes an external Traefik network named `proxy` and a host
route for `photo-shot.example.com` (change it to your domain in the Traefik
labels). It also defines an optional `cloudflared` service for public access via
a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/);
set its public hostname to `http://photo-shot:80` and leave
`CLOUDFLARE_TUNNEL_TOKEN` empty if you don't need it.

## Local development

```bash
cd app
npm install
npm run dev      # http://localhost:3000
```

There is no `/api` proxy in dev, so image generation only works against the
deployed container. The dev server treats all providers as available and accepts
any unlock password. `npm run build` produces `app/dist/`; `npm run preview`
serves it.

## Regenerating icons

The favicon / PWA icons in `app/public/` are generated from the master art at
`app/scripts/icon-source.png`:

```bash
cd app
npm install --no-save sharp png-to-ico
node scripts/generate-icons.mjs
```

## Security notes

- Keys are server-side and gated by `APP_PASSWORD`. It is **required**: the
  container refuses to start (fail closed) on an empty, well-known, or
  under-12-character password, so a default deploy can't be left wide open.
- nginx rate-limits `/api/auth` to slow password brute-forcing; `robots.txt`
  and a `noindex` meta keep the app out of search engines.
- For public exposure, the Cloudflare Tunnel hides your origin IP. You can layer
  Cloudflare WAF / rate-limiting / Access on top if you want stricter gating.

## License

Copyright © 2026 asd123.ai

[GNU General Public License v3.0](LICENSE).
