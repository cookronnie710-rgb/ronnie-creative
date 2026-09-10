#!/usr/bin/env node
/* A local static server, for trying Keel as an installable app.
 *
 * Opening index.html straight from the filesystem works for everything
 * except the service worker and "Add to Home Screen", both of which need a
 * real origin — and browsers also refuse localStorage on file:// URLs, so
 * nothing you enter would be saved. Serve it from here instead.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';

  // Refuse anything that tries to climb out of the project directory.
  const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    // The service worker does the caching; don't let the browser hold a
    // stale copy of a page you have just rebuilt.
    'Cache-Control': 'no-cache'
  });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log('Keel is running at http://localhost:' + PORT);
  console.log('On your phone, use this machine’s address on the same network.');
});
