/* Keel — shared UI components. */
(function (K) {
  'use strict';

  const h = K.Dom.h, U = K.Util;

  /* ------------------------------------------------------------- layout */

  function card(opts, children) {
    const o = opts || {};
    const head = (o.title || o.action) ? h('header.card-head', [
      h('div.card-titles', [
        h('h2.card-title', o.title),
        o.subtitle ? h('p.card-sub', o.subtitle) : null
      ]),
      o.action || null
    ]) : null;
    return h('section.card' + (o.tone ? '.tone-' + o.tone : ''),
      { class: o.class || null }, [head, children]);
  }

  function sectionTitle(text, action) {
    return h('div.section-head', [h('h2.section-title', text), action || null]);
  }

  function empty(message, action) {
    return h('div.empty', [h('p', message), action || null]);
  }

  /* -------------------------------------------------------------- basics */

  function button(label, opts) {
    const o = opts || {};
    return h('button.btn' + (o.variant ? '.btn-' + o.variant : '') +
      (o.size ? '.btn-' + o.size : ''), {
      type: o.type || 'button',
      onclick: o.onClick || null,
      disabled: o.disabled || false,
      'aria-label': o.ariaLabel || null,
      title: o.title || null
    }, o.icon ? [h('span.btn-icon', o.icon), h('span', label)] : label);
  }

  function iconButton(icon, opts) {
    const o = opts || {};
    return h('button.icon-btn', {
      type: 'button',
      onclick: o.onClick || null,
      'aria-label': o.label || icon,
      title: o.label || null,
      class: o.variant ? 'icon-btn-' + o.variant : null
    }, icon);
  }

  // Big number + label. The Today screen leans on these heavily.
  function stat(opts) {
    const o = opts || {};
    return h('div.stat' + (o.tone ? '.tone-' + o.tone : ''), [
      h('div.stat-value', [
        o.value,
        o.unit ? h('span.stat-unit', o.unit) : null
      ]),
      h('div.stat-label', o.label),
      o.note ? h('div.stat-note', o.note) : null
    ]);
  }

  function statRow(stats) {
    return h('div.stat-row', stats);
  }

  function pill(text, tone) {
    return h('span.pill' + (tone ? '.tone-' + tone : ''), text);
  }

  function progress(fraction, tone) {
    const pctVal = U.clamp((fraction || 0) * 100, 0, 100);
    return h('div.progress', {
      role: 'progressbar',
      'aria-valuenow': Math.round(pctVal),
      'aria-valuemin': 0,
      'aria-valuemax': 100
    }, h('div.progress-fill' + (tone ? '.tone-' + tone : ''),
      { style: { width: pctVal + '%' } }));
  }

  /* ------------------------------------------------------------ list row */

  function row(opts) {
    const o = opts || {};
    const inner = [
      o.leading || null,
      h('div.row-body', [
        h('div.row-title', o.title),
        o.subtitle ? h('div.row-sub', o.subtitle) : null
      ]),
      o.trailing || null
    ];
    if (o.onClick) {
      return h('button.row.row-tappable', {
        type: 'button', onclick: o.onClick, class: o.class || null
      }, inner);
    }
    return h('div.row', { class: o.class || null }, inner);
  }

  function checkRow(opts) {
    const o = opts || {};
    return h('div.check-row' + (o.done ? '.is-done' : ''), [
      h('button.check', {
        type: 'button',
        role: 'checkbox',
        'aria-checked': o.done ? 'true' : 'false',
        'aria-label': (o.done ? 'Mark not done: ' : 'Mark done: ') + o.title,
        onclick: o.onToggle || null
      }, o.done ? '✓' : ''),
      h('button.check-body', { type: 'button', onclick: o.onOpen || null }, [
        h('div.check-title', o.title),
        o.subtitle ? h('div.check-sub', o.subtitle) : null
      ]),
      o.trailing || null
    ]);
  }

  /* ---------------------------------------------------------- form field */

  let fieldSeq = 0;

  function field(opts) {
    const o = opts || {};
    const id = 'f' + (++fieldSeq);
    let input;

    const common = {
      id: id,
      'data-focus-key': o.focusKey || id,
      placeholder: o.placeholder || null,
      value: o.value === null || o.value === undefined ? '' : o.value,
      oninput: o.onInput || null,
      onchange: o.onChange || null,
      inputmode: o.inputMode || null,
      autocomplete: o.autocomplete || 'off',
      enterkeyhint: o.enterKeyHint || null
    };

    if (o.type === 'textarea') {
      input = h('textarea.input.textarea', Object.assign({ rows: o.rows || 4 }, common));
    } else if (o.type === 'select') {
      input = h('select.input.select', Object.assign({}, common, { value: undefined }),
        (o.options || []).map(function (opt) {
          return h('option', {
            value: opt.value,
            selected: String(opt.value) === String(o.value)
          }, opt.label);
        }));
      input.value = o.value;
    } else {
      input = h('input.input', Object.assign({
        type: o.type || 'text',
        step: o.step || null,
        min: o.min === undefined ? null : o.min,
        max: o.max === undefined ? null : o.max
      }, common));
    }

    return h('label.field' + (o.wide ? '.field-wide' : ''), { for: id }, [
      h('span.field-label', o.label),
      o.prefix ? h('div.input-wrap', [h('span.input-prefix', o.prefix), input]) : input,
      o.hint ? h('span.field-hint', o.hint) : null
    ]);
  }

  function fieldGroup(children) { return h('div.field-group', children); }

  // Horizontal choice chips — faster than a select on a phone.
  function chips(opts) {
    const o = opts || {};
    return h('div.chips', { role: 'radiogroup', 'aria-label': o.label || null },
      (o.options || []).map(function (opt) {
        const active = String(opt.value) === String(o.value);
        return h('button.chip' + (active ? '.is-active' : ''), {
          type: 'button',
          role: 'radio',
          'aria-checked': active ? 'true' : 'false',
          onclick: function () { if (o.onSelect) o.onSelect(opt.value); }
        }, opt.label);
      }));
  }

  // 1–5 scale used by the daily check-in.
  function scale(opts) {
    const o = opts || {};
    const labels = o.labels || [];
    return h('div.scale', { role: 'radiogroup', 'aria-label': o.label || null },
      [1, 2, 3, 4, 5].map(function (n) {
        const active = Number(o.value) === n;
        return h('button.scale-dot' + (active ? '.is-active' : ''), {
          type: 'button',
          role: 'radio',
          'aria-checked': active ? 'true' : 'false',
          'aria-label': (labels[n - 1] || String(n)),
          onclick: function () { if (o.onSelect) o.onSelect(active ? null : n); }
        }, String(n));
      }));
  }

  /* ----------------------------------------------------------- bottom sheet */

  let openSheet = null;

  function sheet(opts) {
    const o = opts || {};
    closeSheet();

    const body = h('div.sheet-body', o.content);
    const panel = h('div.sheet', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': o.title || 'Dialog'
    }, [
      h('div.sheet-grip'),
      h('header.sheet-head', [
        h('h2.sheet-title', o.title),
        iconButton('✕', { label: 'Close', onClick: closeSheet })
      ]),
      body,
      o.footer ? h('footer.sheet-foot', o.footer) : null
    ]);

    const backdrop = h('div.sheet-backdrop', {
      onclick: function (e) { if (e.target === backdrop) closeSheet(); }
    }, panel);

    document.body.appendChild(backdrop);
    document.body.classList.add('sheet-open');

    const onKey = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
      else if (e.key === 'Tab') trapTab(e, panel);
    };
    document.addEventListener('keydown', onKey);

    openSheet = {
      node: backdrop, onKey: onKey, onClose: o.onClose,
      returnFocus: document.activeElement
    };

    // Focus the first real control so a keyboard or screen reader lands
    // inside the sheet rather than behind it.
    requestAnimationFrame(function () {
      const first = panel.querySelector('input, textarea, select, button:not(.icon-btn)');
      if (first) first.focus({ preventScroll: true });
      else panel.focus({ preventScroll: true });
    });

    return { close: closeSheet, panel: panel };
  }

  function trapTab(e, panel) {
    const focusables = Array.prototype.slice.call(panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function closeSheet() {
    if (!openSheet) return;
    const s = openSheet;
    openSheet = null;
    document.removeEventListener('keydown', s.onKey);
    if (s.node.parentNode) s.node.parentNode.removeChild(s.node);
    document.body.classList.remove('sheet-open');
    if (s.returnFocus && s.returnFocus.focus) {
      try { s.returnFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
    }
    if (s.onClose) s.onClose();
  }

  function isSheetOpen() { return !!openSheet; }

  /* ------------------------------------------------------------- confirm */

  function confirmSheet(opts) {
    const o = opts || {};
    sheet({
      title: o.title || 'Are you sure?',
      content: h('p.sheet-message', o.message || ''),
      footer: [
        button(o.cancelLabel || 'Cancel', { variant: 'ghost', onClick: closeSheet }),
        button(o.confirmLabel || 'Confirm', {
          variant: o.danger ? 'danger' : 'primary',
          onClick: function () { closeSheet(); if (o.onConfirm) o.onConfirm(); }
        })
      ]
    });
  }

  /* --------------------------------------------------------------- toast */

  let toastTimer = null;

  function toast(message, opts) {
    const o = opts || {};
    let node = document.querySelector('.toast');
    if (node) node.remove();
    node = h('div.toast' + (o.tone ? '.tone-' + o.tone : ''), {
      role: 'status', 'aria-live': 'polite'
    }, [
      h('span.toast-text', message),
      o.actionLabel ? h('button.toast-action', {
        type: 'button',
        onclick: function () {
          node.remove();
          if (o.onAction) o.onAction();
        }
      }, o.actionLabel) : null
    ]);
    document.body.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('is-in');
      setTimeout(function () { if (node.parentNode) node.remove(); }, 220);
    }, o.duration || 3200);
  }

  K.C = {
    card: card,
    sectionTitle: sectionTitle,
    empty: empty,
    button: button,
    iconButton: iconButton,
    stat: stat,
    statRow: statRow,
    pill: pill,
    progress: progress,
    row: row,
    checkRow: checkRow,
    field: field,
    fieldGroup: fieldGroup,
    chips: chips,
    scale: scale,
    sheet: sheet,
    closeSheet: closeSheet,
    isSheetOpen: isSheetOpen,
    confirmSheet: confirmSheet,
    toast: toast
  };
})(globalThis.Keel = globalThis.Keel || {});
