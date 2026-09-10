import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The build is cheap and deterministic, so run it rather than testing a
// stale artefact from someone's working copy.
test('the build runs clean', () => {
  const out = execFileSync('node', [join(ROOT, 'build.mjs')], { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /Keel built/);
});

test('every artefact the app needs is produced', () => {
  for (const f of ['index.html', 'manifest.json', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is missing');
    assert.ok(statSync(join(ROOT, f)).size > 0, f + ' is empty');
  }
});

test('index.html is genuinely self-contained', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

  // No external script or stylesheet may sneak in: this has to work with
  // no network at all, which is the whole point.
  assert.equal(/<script[^>]+src=/i.test(html), false, 'no external scripts');
  assert.equal(/<link[^>]+rel=["']?stylesheet/i.test(html), false, 'no external stylesheets');
  // What matters is whether anything *fetches* from the network, not whether
  // the string "https://" appears — it legitimately does, as a placeholder in
  // the "link to the job ad" field.
  const fetching = [
    /\ssrc\s*=\s*["']?https?:/i,
    /\shref\s*=\s*["']?https?:(?!\/\/www\.w3\.org)/i,
    /@import/i,
    /url\(\s*["']?https?:/i
  ];
  for (const pattern of fetching) {
    assert.equal(pattern.test(html), false, 'nothing may load from the network: ' + pattern);
  }

  assert.match(html, /<div id="app">/);
  assert.match(html, /<noscript>/, 'a page that needs JavaScript should say so');
  assert.match(html, /viewport-fit=cover/, 'notched phones need the safe-area viewport');
});

test('every module makes it into the bundle, in dependency order', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const modules = [
    'core/util', 'core/model', 'core/money', 'core/habits', 'core/work',
    'core/health', 'core/tasks', 'core/insights', 'core/review', 'core/export',
    'core/actions', 'core/store', 'ui/dom', 'ui/components', 'ui/charts',
    'ui/forms', 'ui/screen-today', 'ui/screen-money', 'ui/screen-work',
    'ui/screen-life', 'ui/screen-tasks', 'ui/screen-review', 'ui/screen-settings',
    'ui/app', 'ui/boot'
  ];
  let previous = -1;
  for (const m of modules) {
    const at = html.indexOf('/* ==== ' + m + ' ==== */');
    assert.ok(at > 0, m + ' is not in the bundle');
    assert.ok(at > previous, m + ' is out of order');
    previous = at;
  }
});

test('the bundle has no stray closing script tag to break the page', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const opens = (html.match(/<script>/g) || []).length;
  const closes = (html.match(/<\/script>/g) || []).length;
  assert.equal(opens, 1);
  assert.equal(closes, 1, 'an unescaped </script> inside the JS would end the block early');
});

test('the manifest is installable', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(m.name, 'Keel');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'Android needs a maskable icon');
  assert.match(m.start_url, /index\.html$/);
});

test('the icons are real PNGs at the sizes they claim', () => {
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
    const buf = readFileSync(join(ROOT, file));
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
      file + ' is not a PNG');
    assert.equal(buf.readUInt32BE(16), size, file + ' width');
    assert.equal(buf.readUInt32BE(20), size, file + ' height');
    assert.equal(buf[24], 8, 'bit depth');
    assert.equal(buf[25], 6, 'RGBA');
  }
});

test('the service worker caches the shell and leaves other origins alone', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'keel-/);
  assert.match(sw, /'\.\/index\.html'/);
  assert.match(sw, /url\.origin !== location\.origin/, 'must not intercept other origins');
  assert.match(sw, /req\.method !== 'GET'/);
});
