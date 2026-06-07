// Generates the PWA / favicon PNGs from public/icon.png (the chameleon mascot).
//
// `sharp` is only needed to (re)generate icons — it is NOT a runtime or build
// dependency of the app. The generated PNGs are committed to the repo.
//
// To regenerate:
//   npm install --no-save sharp
//   npm install --no-save sharp png-to-ico
//   node scripts/generate-icons.mjs
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');
const src = path.join(root, 'icon-source.png'); // master art, kept out of the bundle

await mkdir(iconsDir, { recursive: true });

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Render the (trimmed) mascot centered on a `size` square canvas with `pad`
// breathing room. All icons keep the transparent background; we deliberately do
// NOT ship an opaque maskable icon, which is what forced a black/white tile on
// the home screen. (iOS still fills transparency itself: white on iOS 18+,
// black before — an Apple limitation. Android launchers honour transparency.)
async function make(out, size, { pad = 0.06, bg = CLEAR } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const fg = await sharp(src)
    .trim()
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: fg, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, out));
  console.log(`✓ ${out} (${size}x${size})`);
}

// Tab / launcher icons — transparent so they sit on any background.
await make('icons/favicon-16.png', 16, { pad: 0.04 });
await make('icons/favicon-32.png', 32, { pad: 0.04 });
await make('icons/pwa-192.png', 192, { pad: 0.06 });
await make('icons/pwa-512.png', 512, { pad: 0.06 });
// In-app header logo (transparent, tight crop).
await make('icons/chameleon.png', 96, { pad: 0.02 });
// Home-screen icon — transparent (no opaque maskable).
await make('icons/apple-touch-icon.png', 180, { pad: 0.08 });

// Root-level icons. Browsers/iOS probe these exact paths by default; without
// real files they fall through to the SPA index.html (text/html), which leaves
// a stale/broken favicon. Serve the real icon at the well-known locations.
await make('apple-touch-icon.png', 180, { pad: 0.08 });
await make('apple-touch-icon-precomposed.png', 180, { pad: 0.08 });

// favicon.ico (multi-size) at the web root.
const icoBuffers = await Promise.all([16, 32, 48].map(async (s) => {
  const inner = Math.round(s * (1 - 0.04 * 2));
  const fg = await sharp(src).trim().resize(inner, inner, { fit: 'contain', background: CLEAR }).toBuffer();
  return sharp({ create: { width: s, height: s, channels: 4, background: CLEAR } })
    .composite([{ input: fg, gravity: 'center' }])
    .png()
    .toBuffer();
}));
await writeFile(path.join(publicDir, 'favicon.ico'), await pngToIco(icoBuffers));
console.log('✓ favicon.ico (16/32/48)');

console.log('Done.');
