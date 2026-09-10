/* End-to-end checks against the built page in a real browser.
 *
 * Playwright is optional: these tests skip themselves when it is not
 * installed, so `npm test` still works on a clean checkout with no
 * dependencies at all. CI installs it and runs them for real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Left null; every test below skips.
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css'
};

function serve() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

// The container ships a browser that may not match Playwright's expected
// build, so use it directly when it is there.
function launchOptions() {
  const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSync(pinned) ? { executablePath: pinned } : {};
}

async function withPage(fn) {
  const { server, port } = await serve();
  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });

  try {
    await fn(page, { port, problems, context });
  } finally {
    await browser.close();
    server.close();
  }
  assert.deepEqual(problems, [], 'the page must run clean');
}

const opts = { skip: chromium ? false : 'playwright is not installed' };

test('every screen renders without errors', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForSelector('.tabbar');

    const routes = [
      '#/today', '#/money', '#/work', '#/work/gigs', '#/life', '#/life/health',
      '#/life/journal', '#/tasks', '#/tasks/projects', '#/tasks/someday',
      '#/tasks/done', '#/review', '#/settings'
    ];
    for (const route of routes) {
      await page.evaluate((h) => { location.hash = h; }, route);
      await page.waitForTimeout(120);
      const blocks = await page.locator('#screen > *').count();
      assert.ok(blocks > 0, route + ' rendered nothing');
    }
  });
});

test('an unknown route falls back to Today rather than a blank page', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html#/nonsense`);
    await page.waitForSelector('.tabbar');
    assert.ok(await page.locator('#screen > *').count() > 0);
    await assert.doesNotReject(page.waitForSelector('.greeting', { timeout: 2000 }));
  });
});

test('adding a task keeps it across a reload', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html#/tasks`);
    await page.waitForSelector('[data-focus-key="tasks-quick"]');

    await page.fill('[data-focus-key="tasks-quick"]', 'Post the PS2 lot');
    await page.press('[data-focus-key="tasks-quick"]', 'Enter');
    await page.waitForTimeout(250);
    await assert.doesNotReject(
      page.waitForSelector('text=Post the PS2 lot', { timeout: 2000 }));

    await page.waitForTimeout(600); // let the debounced save land
    await page.reload();
    await page.waitForSelector('.tabbar');
    await assert.doesNotReject(
      page.waitForSelector('text=Post the PS2 lot', { timeout: 2000 }),
      'the task should survive a reload');
  });
});

test('ticking a habit persists and undo puts it back', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html#/today`);
    await page.waitForSelector('.habit-tile');

    const before = await page.locator('.habit-tile.is-done').count();
    await page.locator('.habit-tile').first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.habit-tile.is-done').count(), before + 1);

    await page.locator('.appbar-actions .icon-btn').first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.habit-tile.is-done').count(), before,
      'undo should untick it');
  });
});

test('typing in a field does not lose the caret to a re-render', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html#/life/journal`);
    await page.waitForSelector('[data-focus-key="journal-text"]');

    await page.click('[data-focus-key="journal-text"]');
    await page.keyboard.type('Sorted the loft boxes today');
    await page.waitForTimeout(300);

    const value = await page.inputValue('[data-focus-key="journal-text"]');
    assert.equal(value, 'Sorted the loft boxes today', 'no keystrokes may be dropped');
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute('data-focus-key')),
      'journal-text', 'focus must stay in the field');
  });
});

test('a form sheet opens, traps focus and closes on Escape', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html#/money`);
    await page.waitForSelector('.card');

    await page.locator('.card:has-text("Goals") button:has-text("Add")').first().click();
    await page.waitForSelector('.sheet');

    const inside = await page.evaluate(() =>
      document.querySelector('.sheet').contains(document.activeElement));
    assert.equal(inside, true, 'focus should move into the dialog');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.sheet').count(), 0, 'Escape should close it');
  });
});

test('nothing overflows horizontally at phone width', opts, async () => {
  await withPage(async (page, { port }) => {
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForSelector('.tabbar');
    for (const route of ['#/today', '#/money', '#/work', '#/life', '#/review', '#/settings']) {
      await page.evaluate((h) => { location.hash = h; }, route);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, route + ' scrolls sideways by ' + overflow + 'px');
    }
  });
});

test('the app still runs when storage is unavailable', opts, async () => {
  await withPage(async (page, { port, context }) => {
    // Simulate a locked-down private window: present, but throws on use.
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new Error('storage is blocked'); }
      });
    });
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForSelector('.tabbar');
    assert.ok(await page.locator('#screen > *').count() > 0,
      'a blocked storage must not stop the app rendering');
  });
});
