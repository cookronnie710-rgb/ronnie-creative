/* Keel — minimal DOM helpers. No framework, no build-time templating. */
(function (K) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = {
    svg: 1, g: 1, path: 1, rect: 1, circle: 1, line: 1, polyline: 1, polygon: 1,
    text: 1, defs: 1, linearGradient: 1, stop: 1, title: 1, tspan: 1
  };

  // Parses 'div.card.wide#id' into tag, classes and id.
  function parseSelector(sel) {
    const m = /^([a-zA-Z][a-zA-Z0-9]*)?((?:[.#][^.#]+)*)$/.exec(sel);
    if (!m) return { tag: 'div', classes: [], id: null };
    const tag = m[1] || 'div';
    const classes = [];
    let id = null;
    (m[2] || '').split(/(?=[.#])/).forEach(function (part) {
      if (!part) return;
      if (part[0] === '.') classes.push(part.slice(1));
      else if (part[0] === '#') id = part.slice(1);
    });
    return { tag: tag, classes: classes, id: id };
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
      return;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
      return;
    }
    parent.appendChild(document.createTextNode(String(child)));
  }

  function h(sel, props, children) {
    // h('div', [children]) — props may be omitted.
    if (Array.isArray(props) || props instanceof Node ||
        typeof props === 'string' || typeof props === 'number') {
      children = props;
      props = null;
    }
    const p = parseSelector(sel);
    const isSvg = !!SVG_TAGS[p.tag];
    const node = isSvg
      ? document.createElementNS(SVG_NS, p.tag)
      : document.createElement(p.tag);

    if (p.classes.length) {
      if (isSvg) node.setAttribute('class', p.classes.join(' '));
      else node.className = p.classes.join(' ');
    }
    if (p.id) node.id = p.id;

    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;

        if (k === 'class' || k === 'className') {
          const existing = isSvg ? (node.getAttribute('class') || '') : node.className;
          const merged = (existing ? existing + ' ' : '') + v;
          if (isSvg) node.setAttribute('class', merged); else node.className = merged;
        } else if (k === 'style' && typeof v === 'object') {
          Object.keys(v).forEach(function (s) { node.style[s] = v[s]; });
        } else if (k === 'dataset') {
          Object.keys(v).forEach(function (s) { node.dataset[s] = v[s]; });
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'html') {
          node.innerHTML = v;
        } else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' ||
                              k === 'selected' || k === 'textContent')) {
          node[k] = v;
        } else {
          node.setAttribute(k, v === true ? '' : v);
        }
      });
    }

    append(node, children);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function mount(parent, children) {
    clear(parent);
    append(parent, children);
    return parent;
  }

  function frag(children) {
    const f = document.createDocumentFragment();
    append(f, children);
    return f;
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(node, event, handler, opts) {
    node.addEventListener(event, handler, opts);
    return function () { node.removeEventListener(event, handler, opts); };
  }

  // Delegated listener: one handler on a container, matched by selector.
  function delegate(root, event, selector, handler) {
    return on(root, event, function (e) {
      const target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    });
  }

  /* --------------------------------------------------- focus preservation */
  /* Screens re-render wholesale. Without this, a re-render triggered while
     you are typing would drop the caret and eat the next keystroke. */

  function captureFocus(root) {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    const key = a.getAttribute && a.getAttribute('data-focus-key');
    if (!key) return null;
    const out = { key: key };
    if (a.selectionStart !== undefined && a.selectionStart !== null) {
      try {
        out.start = a.selectionStart;
        out.end = a.selectionEnd;
      } catch (e) { /* some input types disallow selection reads */ }
    }
    return out;
  }

  function restoreFocus(root, saved) {
    if (!saved) return;
    const node = root.querySelector('[data-focus-key="' + cssEscape(saved.key) + '"]');
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
      if (saved.start !== undefined && node.setSelectionRange) {
        node.setSelectionRange(saved.start, saved.end);
      }
    } catch (e) { /* focusing can throw on detached or hidden nodes */ }
  }

  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, '\\$&');
  }

  K.Dom = {
    h: h,
    clear: clear,
    mount: mount,
    frag: frag,
    qs: qs,
    qsa: qsa,
    on: on,
    delegate: delegate,
    captureFocus: captureFocus,
    restoreFocus: restoreFocus,
    cssEscape: cssEscape
  };
})(globalThis.Keel = globalThis.Keel || {});
