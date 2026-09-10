/* Keel — boot. Runs last, after every module has registered itself. */
(function (K) {
  'use strict';

  function pickStorage() {
    // Feature-detect properly: Safari in private mode exposes localStorage
    // but throws on write, so a presence check is not enough.
    try {
      const probe = '__keel_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch (e) {
      return K.Store.memoryStorage();
    }
  }

  function start() {
    const root = document.getElementById('app');
    if (!root) return;

    const store = K.Store.create({ storage: pickStorage() });
    const app = K.App.create(store);

    K.instance = { store: store, app: app };
    app.mount(root);

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {
          // Offline caching is a bonus; the app works without it.
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(globalThis.Keel = globalThis.Keel || {});
