/* Loads Keel's pure core into the current Node context.
   The core touches nothing but `globalThis.Keel`, so it runs unmodified
   outside a browser — which is the whole reason the logic lives apart
   from the DOM. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULES = [
  'util', 'model', 'money', 'habits', 'work', 'health', 'tasks',
  'insights', 'review', 'export', 'actions', 'store'
];

let loaded = false;

export function core() {
  if (!loaded) {
    for (const m of MODULES) {
      vm.runInThisContext(readFileSync(join(ROOT, 'src/core', m + '.js'), 'utf8'),
        { filename: 'src/core/' + m + '.js' });
    }
    loaded = true;
  }
  return globalThis.Keel;
}

// A deterministic pseudo-random source, so a failing test fails the same way
// twice. Math.random in a test is a flake generator.
export function rng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function freshStore() {
  const K = core();
  const store = K.Store.create({ storage: K.Store.memoryStorage() });
  store.load();
  return store;
}
