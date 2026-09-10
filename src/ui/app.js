/* Keel — app shell: routing, chrome, and the render loop. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util;

  const TABS = [
    { id: 'today', route: '#/today', label: 'Today', icon: '◎' },
    { id: 'money', route: '#/money', label: 'Money', icon: '£' },
    { id: 'work', route: '#/work', label: 'Work', icon: '◈' },
    { id: 'life', route: '#/life', label: 'Life', icon: '❋' },
    { id: 'review', route: '#/review', label: 'Review', icon: '✦' }
  ];

  // Screens reached from within a tab rather than from the tab bar.
  const TAB_OF = { tasks: 'today', settings: 'review' };

  // A patch is a keystroke in a text field. Re-rendering the screen on every
  // one of those would fight the caret, so those changes are left to the
  // input itself and the screen redraws on the next real action.
  const SILENT_REASONS = { patch: 1, focus: 1, checkin: 1, journal: 1, profile: 1, review: 1 };

  function create(store) {
    let root = null;
    let currentRoute = null;
    let scrollPositions = {};
    let pendingRender = null;

    /* ------------------------------------------------------------ routing */

    function parseRoute() {
      const raw = (location.hash || '#/today').replace(/^#\/?/, '');
      const parts = raw.split('/').filter(Boolean);
      return {
        screen: parts[0] || 'today',
        param: parts[1] || null,
        sub: parts[2] || null
      };
    }

    function go(route) {
      if (location.hash === route) render();
      else location.hash = route;
    }

    function onHashChange() {
      const next = parseRoute();
      const key = next.screen + '/' + (next.param || '');
      if (currentRoute && currentRoute.key === key) return;
      C.closeSheet();
      render();
      // Landing on a new screen should start at the top, but coming back to
      // a tab should land where you left it.
      const saved = scrollPositions[key];
      requestAnimationFrame(function () {
        window.scrollTo(0, saved || 0);
      });
    }

    function rememberScroll() {
      if (currentRoute) scrollPositions[currentRoute.key] = window.scrollY;
    }

    /* ------------------------------------------------------------- render */

    function render() {
      if (!root) return;
      const r = parseRoute();
      const key = r.screen + '/' + (r.param || '');
      const screen = K.Screens[r.screen] || K.Screens.today;
      const saved = K.Dom.captureFocus(root);

      currentRoute = { key: key, screen: r.screen, param: r.param, sub: r.sub };

      const ctx = {
        store: store,
        state: store.state,
        actions: store.actions,
        today: store.today(),
        param: r.param,
        sub: r.sub,
        go: go,
        render: render,
        refresh: scheduleRender
      };

      const body = h('main.screen', { id: 'screen', tabindex: '-1' }, screen.render(ctx));
      const activeTab = TAB_OF[r.screen] || r.screen;

      K.Dom.mount(root, [
        chrome(ctx, r),
        body,
        tabBar(activeTab),
        store.error ? h('div.storage-warning', { role: 'alert' }, store.error) : null
      ]);

      K.Dom.restoreFocus(root, saved);
    }

    function scheduleRender() {
      if (pendingRender) return;
      pendingRender = requestAnimationFrame(function () {
        pendingRender = null;
        render();
      });
    }

    /* ------------------------------------------------------------- chrome */

    function chrome(ctx, r) {
      const backTo = r.screen === 'tasks' ? '#/today'
        : (r.screen === 'settings' ? '#/review' : null);

      return h('header.appbar', [
        backTo
          ? C.iconButton('‹', { label: 'Back', onClick: function () { go(backTo); } })
          : h('div.appbar-brand', [
              h('span.appbar-mark', 'K'),
              h('span.appbar-name', 'Keel')
            ]),
        h('div.appbar-mid', h('span.appbar-date', U.formatDate(ctx.today, 'medium'))),
        h('div.appbar-actions', [
          store.canUndo()
            ? C.iconButton('↺', {
                label: 'Undo ' + (store.lastUndoLabel() || 'last change'),
                onClick: function () {
                  const label = store.undo();
                  if (label) C.toast('Undid ' + label, { tone: 'info' });
                }
              })
            : null,
          C.iconButton('⚙', { label: 'Settings', onClick: function () { go('#/settings'); } })
        ])
      ]);
    }

    function tabBar(active) {
      return h('nav.tabbar', { 'aria-label': 'Main' }, TABS.map(function (t) {
        const isActive = t.id === active;
        return h('a.tab' + (isActive ? '.is-active' : ''), {
          href: t.route,
          'aria-current': isActive ? 'page' : null
        }, [
          h('span.tab-icon', { 'aria-hidden': 'true' }, t.icon),
          h('span.tab-label', t.label)
        ]);
      }));
    }

    /* --------------------------------------------------------------- boot */

    function mount(el) {
      root = el;
      store.load();

      store.subscribe(function (state, reason) {
        if (SILENT_REASONS[reason]) return;
        scheduleRender();
      });

      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('scroll', rememberScroll, { passive: true });

      // A tab left open past midnight should wake up on the new day rather
      // than quietly logging to yesterday.
      let lastDay = store.today();
      setInterval(function () {
        const now = U.today();
        if (now !== lastDay) {
          lastDay = now;
          scheduleRender();
        }
      }, 60000);

      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) scheduleRender();
      });

      window.addEventListener('beforeunload', function () { store.saveNow(); });

      if (!location.hash) location.hash = '#/today';
      render();
    }

    return { mount: mount, render: render, go: go, TABS: TABS };
  }

  K.App = { create: create, TABS: TABS };
})(globalThis.Keel = globalThis.Keel || {});
