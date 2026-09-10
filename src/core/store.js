/* Keel — the store: state, persistence, undo, and every mutation.
   Storage is injected, so the whole thing runs and tests outside a browser. */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model;

  const STORAGE_KEY = 'keel.state.v1';
  const UNDO_LIMIT = 25;

  function clone(v) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(v); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(v));
  }

  // A storage that always works, so the app still runs in a private window
  // with storage blocked — it just forgets when you close the tab.
  function memoryStorage() {
    const map = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; }
    };
  }

  function create(opts) {
    const o = opts || {};
    const storage = o.storage || memoryStorage();
    const key = o.key || STORAGE_KEY;
    const now = o.now || null;

    let state = null;
    let undoStack = [];
    let redoStack = [];
    let listeners = [];
    let saveTimer = null;
    let lastError = null;
    let loadedFresh = false;

    /* ------------------------------------------------------------ load */

    function load() {
      let raw = null;
      try {
        raw = storage.getItem(key);
      } catch (e) {
        lastError = 'Storage is unavailable, so nothing will be saved.';
      }
      if (!raw) {
        state = M.seedState(now);
        loadedFresh = true;
        return state;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        // Never throw away a corrupt blob silently — park it so the data
        // can be recovered by hand rather than lost.
        try { storage.setItem(key + '.corrupt.' + Date.now(), raw); } catch (e2) { /* ignore */ }
        lastError = 'Saved data could not be read, so Keel started fresh. ' +
          'The unreadable copy has been kept in case it can be recovered.';
        state = M.seedState(now);
        loadedFresh = true;
        return state;
      }
      const body = (parsed && parsed.state) ? parsed.state : parsed;
      state = M.normalise(M.migrate(body), now);
      loadedFresh = false;
      return state;
    }

    /* ------------------------------------------------------------ save */

    function saveNow() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      try {
        storage.setItem(key, JSON.stringify({ app: 'keel', version: M.SCHEMA_VERSION, state: state }));
        lastError = null;
        return true;
      } catch (e) {
        lastError = (e && e.name === 'QuotaExceededError')
          ? 'Out of storage space. Export a backup and clear old data.'
          : 'Could not save. Your changes are only in this tab.';
        return false;
      }
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 400);
    }

    /* -------------------------------------------------------- subscribe */

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) { return l !== fn; });
      };
    }

    function notify(reason) {
      listeners.slice().forEach(function (fn) {
        try { fn(state, reason); } catch (e) {
          if (typeof console !== 'undefined') console.error('Keel listener failed', e);
        }
      });
    }

    /* ----------------------------------------------------------- mutate */

    // A discrete, undoable action.
    function commit(label, mutator) {
      undoStack.push({ label: label, snapshot: clone(state) });
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
      const result = mutator(state);
      scheduleSave();
      notify(label);
      return result;
    }

    // A continuous edit (typing in a field). Saves, but does not clutter
    // the undo stack with one entry per keystroke.
    function patch(mutator, reason) {
      const result = mutator(state);
      scheduleSave();
      notify(reason || 'patch');
      return result;
    }

    function undo() {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push({ label: entry.label, snapshot: clone(state) });
      state = entry.snapshot;
      scheduleSave();
      notify('undo');
      return entry.label;
    }

    function redo() {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push({ label: entry.label, snapshot: clone(state) });
      state = entry.snapshot;
      scheduleSave();
      notify('redo');
      return entry.label;
    }

    function canUndo() { return undoStack.length > 0; }
    function lastUndoLabel() {
      return undoStack.length ? undoStack[undoStack.length - 1].label : null;
    }

    function replace(nextState, label) {
      undoStack.push({ label: label || 'replace everything', snapshot: clone(state) });
      state = M.normalise(nextState, now);
      redoStack = [];
      saveNow();
      notify('replace');
    }

    function reset() {
      replace(M.seedState(now), 'reset everything');
    }

    const store = {
      load: load,
      saveNow: saveNow,
      subscribe: subscribe,
      notify: notify,
      commit: commit,
      patch: patch,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      lastUndoLabel: lastUndoLabel,
      replace: replace,
      reset: reset,
      today: function () { return U.today(now); },
      get state() { return state; },
      get error() { return lastError; },
      get isFresh() { return loadedFresh; }
    };

    K.Actions.bind(store);
    return store;
  }

  K.Store = { create: create, memoryStorage: memoryStorage, STORAGE_KEY: STORAGE_KEY };
})(globalThis.Keel = globalThis.Keel || {});
