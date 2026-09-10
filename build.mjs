#!/usr/bin/env node
/* Keel build.
 *
 * Produces a single self-contained index.html with the CSS and every module
 * inlined, so the app opens straight from the filesystem with no server, no
 * network and no dependencies. Uses only Node built-ins.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 as nodeCrc32 } from 'node:zlib';

const ROOT = dirname(fileURLToPath(import.meta.url));

/* Load order matters: core before UI, boot last. */
const CORE = [
  'util', 'model', 'money', 'habits', 'work', 'health', 'tasks',
  'insights', 'review', 'export', 'actions', 'store'
];

const UI = [
  'dom', 'components', 'charts', 'forms',
  'screen-today', 'screen-money', 'screen-work', 'screen-life',
  'screen-tasks', 'screen-review', 'screen-settings',
  'app', 'boot'
];

const APP_NAME = 'Keel';
const APP_DESC = 'Money, work, habits, health and notes in one place — offline, private, yours.';
const THEME_COLOR = '#101215';

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/* A closing </script> anywhere inside inlined JS would end the block early.
   Nothing else needs escaping inside a classic script element. */
function escapeForScript(js) {
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

function escapeForStyle(css) {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

function banner(name) {
  return '\n/* ==== ' + name + ' ==== */\n';
}

function buildBundle() {
  const parts = [];
  CORE.forEach((f) => parts.push(banner('core/' + f) + read('src/core/' + f + '.js')));
  UI.forEach((f) => parts.push(banner('ui/' + f) + read('src/ui/' + f + '.js')));
  return parts.join('\n');
}

/* --------------------------------------------------------------- icons */
/* A minimal PNG writer. The icon is flat colour and a couple of shapes, so
   hand-rolling the encoder is cheaper than taking on an image dependency. */

function crc32(buf) {
  // Node exposes a CRC-32 from zlib; fall back to a table if it is absent.
  if (typeof nodeCrc32 === 'function') return nodeCrc32(buf) >>> 0;
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with a filter byte; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    pixels.copy(raw, p, y * size * 4, (y + 1) * size * 4);
    p += size * 4;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hex(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ];
}

// The mark: a rounded slab in the brand blue with a keel-line notch cut
// through it. Rendered with coverage-based antialiasing so it stays clean
// at 192px and at 512px.
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = hex('#101215');
  const fg = hex('#3987e5');
  const light = hex('#f2f4f7');

  const S = size;
  const r = S * 0.22;          // corner radius of the tile
  const inset = S * 0.06;

  function roundedRect(x, y, w, h, rad) {
    return function (px_, py) {
      const dx = Math.max(x + rad - px_, 0, px_ - (x + w - rad));
      const dy = Math.max(y + rad - py, 0, py - (y + h - rad));
      return Math.sqrt(dx * dx + dy * dy) - rad;
    };
  }

  const tile = roundedRect(inset, inset, S - inset * 2, S - inset * 2, r);

  // The "K": a vertical stroke plus two diagonals, described as distance
  // fields so the antialiasing comes out even.
  const strokeW = S * 0.085;
  const x0 = S * 0.34, yTop = S * 0.28, yBot = S * 0.72;

  function segment(ax, ay, bx, by, half) {
    return function (px_, py) {
      const vx = bx - ax, vy = by - ay;
      const wx = px_ - ax, wy = py - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
      const cx = ax + t * vx, cy = ay + t * vy;
      return Math.hypot(px_ - cx, py - cy) - half;
    };
  }

  const stem = segment(x0, yTop, x0, yBot, strokeW / 2);
  const upper = segment(x0, S * 0.52, S * 0.68, yTop, strokeW / 2);
  const lower = segment(x0, S * 0.52, S * 0.68, yBot, strokeW / 2);

  function coverage(d) {
    // One-pixel-wide linear ramp across the edge.
    return Math.max(0, Math.min(1, 0.5 - d));
  }

  let i = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = x + 0.5, cy = y + 0.5;

      const tileA = coverage(tile(cx, cy));
      const glyphD = Math.min(stem(cx, cy), upper(cx, cy), lower(cx, cy));
      const glyphA = coverage(glyphD);

      let r0 = bg[0], g0 = bg[1], b0 = bg[2];
      // Tile over the background, then the glyph over the tile.
      r0 = r0 + (fg[0] - r0) * tileA;
      g0 = g0 + (fg[1] - g0) * tileA;
      b0 = b0 + (fg[2] - b0) * tileA;
      r0 = r0 + (light[0] - r0) * glyphA;
      g0 = g0 + (light[1] - g0) * glyphA;
      b0 = b0 + (light[2] - b0) * glyphA;

      px[i++] = Math.round(r0);
      px[i++] = Math.round(g0);
      px[i++] = Math.round(b0);
      px[i++] = 255;
    }
  }
  return px;
}

function iconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Keel">
  <rect width="512" height="512" rx="112" fill="#101215"/>
  <rect x="31" y="31" width="450" height="450" rx="99" fill="#3987e5"/>
  <g stroke="#f2f4f7" stroke-width="44" stroke-linecap="round" fill="none">
    <path d="M174 143 V369"/>
    <path d="M174 266 L348 143"/>
    <path d="M174 266 L348 369"/>
  </g>
</svg>
`;
}

/* -------------------------------------------------------------- manifest */

function manifest() {
  return JSON.stringify({
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESC,
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ['productivity', 'lifestyle', 'finance'],
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: './icon.svg', sizes: 'any', type: 'image/svg+xml' }
    ]
  }, null, 2);
}

/* ------------------------------------------------------- service worker */

function serviceWorker(version) {
  return `/* Keel service worker — cache-first for the shell, generated by build.mjs. */
const CACHE = 'keel-${version}';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Serve instantly, then quietly refresh for next time.
        event.waitUntil(
          fetch(req)
            .then((res) => res && res.ok && caches.open(CACHE).then((c) => c.put(req, res)))
            .catch(() => {})
        );
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
`;
}

/* ------------------------------------------------------------------ html */

function html(css, js) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${APP_NAME}</title>
<meta name="description" content="${APP_DESC}">
<meta name="theme-color" content="${THEME_COLOR}">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${APP_NAME}">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<style>
${escapeForStyle(css)}
</style>
</head>
<body>
<noscript>
  <div style="padding:24px;font-family:system-ui,sans-serif;color:#f2f4f7">
    <h1>Keel needs JavaScript</h1>
    <p>Everything runs on your own device, which means it runs in the page itself.
    Turn JavaScript on for this file and it will work offline from then on.</p>
  </div>
</noscript>
<div id="app"></div>
<script>
${escapeForScript(js)}
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ main */

function main() {
  const css = read('src/styles.css');
  const js = buildBundle();
  // Derived from the content alone, so two builds of the same source produce
  // byte-identical output. A timestamp here would make every rebuild look
  // like a change and defeat the "is the committed build current?" check.
  const version = (crc32(Buffer.from(css + js)) >>> 0).toString(36);

  const out = html(css, js);
  writeFileSync(join(ROOT, 'index.html'), out);
  writeFileSync(join(ROOT, 'manifest.json'), manifest() + '\n');
  writeFileSync(join(ROOT, 'sw.js'), serviceWorker(version));
  writeFileSync(join(ROOT, 'icon.svg'), iconSVG());
  writeFileSync(join(ROOT, 'icon-192.png'), encodePNG(192, drawIcon(192)));
  writeFileSync(join(ROOT, 'icon-512.png'), encodePNG(512, drawIcon(512)));

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log('Keel built');
  console.log('  index.html   ' + kb(Buffer.byteLength(out)));
  console.log('  css          ' + kb(Buffer.byteLength(css)));
  console.log('  js           ' + kb(Buffer.byteLength(js)) +
    '  (' + (CORE.length + UI.length) + ' modules)');
  console.log('  version      ' + version + '  (content hash — builds are reproducible)');
}

main();
