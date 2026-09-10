/* Keel — core utilities. Pure logic, no DOM. */
(function (K) {
  'use strict';

  /* ---------------------------------------------------------------- ids */

  // Monotonic-ish, collision-resistant enough for a single-device app.
  function uid(prefix) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + t + r;
  }

  /* -------------------------------------------------------------- dates */
  /* Everything user-facing is a local calendar day held as 'YYYY-MM-DD'.
     We never round-trip through UTC, because a UK user in BST would
     otherwise see their day flip an hour early. */

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fromISODate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // Reject impossible dates like 2026-02-31 that Date would roll over.
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
    return d;
  }

  function isISODate(s) { return fromISODate(s) !== null; }

  function today(now) { return toISODate(now instanceof Date ? now : new Date()); }

  function addDays(iso, n) {
    const d = fromISODate(iso);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function addMonths(iso, n) {
    const d = fromISODate(iso);
    if (!d) return null;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    // Clamp: 31 Jan + 1 month is 28/29 Feb, not 3 March.
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISODate(d);
  }

  function daysBetween(a, b) {
    const da = fromISODate(a), db = fromISODate(b);
    if (!da || !db) return null;
    // Compare at UTC noon so a DST boundary can't shave or add an hour.
    const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate(), 12);
    const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate(), 12);
    return Math.round((ub - ua) / 86400000);
  }

  // ISO-8601 week: weeks start Monday; week 1 contains the first Thursday.
  function startOfWeek(iso) {
    const d = fromISODate(iso);
    if (!d) return null;
    const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
    d.setDate(d.getDate() - dow);
    return toISODate(d);
  }

  function endOfWeek(iso) {
    const s = startOfWeek(iso);
    return s ? addDays(s, 6) : null;
  }

  function startOfMonth(iso) {
    const d = fromISODate(iso);
    return d ? toISODate(new Date(d.getFullYear(), d.getMonth(), 1)) : null;
  }

  function endOfMonth(iso) {
    const d = fromISODate(iso);
    return d ? toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) : null;
  }

  function monthKey(iso) { return String(iso || '').slice(0, 7); }

  function isoWeekKey(iso) {
    const d = fromISODate(iso);
    if (!d) return null;
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Shift to the Thursday of this week; its year is the ISO week-year.
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const week1 = new Date(t.getFullYear(), 0, 4);
    week1.setDate(week1.getDate() + 3 - ((week1.getDay() + 6) % 7));
    const n = 1 + Math.round((t - week1) / (7 * 86400000));
    return t.getFullYear() + '-W' + pad2(n);
  }

  // Inclusive list of days from `from` to `to`. Capped so a bad date can
  // never spin the UI into an unbounded loop.
  function dateRange(from, to, cap) {
    const limit = cap == null ? 3660 : cap; // ~10 years
    const out = [];
    let cur = from;
    if (!isISODate(from) || !isISODate(to)) return out;
    let guard = 0;
    while (cur && daysBetween(cur, to) >= 0 && guard++ < limit) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function dayOfWeek(iso) {
    const d = fromISODate(iso);
    return d ? (d.getDay() + 6) % 7 : null; // Mon=0
  }

  function formatDate(iso, style) {
    const d = fromISODate(iso);
    if (!d) return '';
    const dn = DAY_NAMES[(d.getDay() + 6) % 7];
    const mn = MONTH_NAMES[d.getMonth()];
    if (style === 'long') return dn + ' ' + d.getDate() + ' ' + mn + ' ' + d.getFullYear();
    if (style === 'medium') return dn + ' ' + d.getDate() + ' ' + mn.slice(0, 3);
    if (style === 'month') return mn + ' ' + d.getFullYear();
    return d.getDate() + ' ' + mn.slice(0, 3);
  }

  // "today", "yesterday", "in 3 days", "12 days ago"
  function relativeDay(iso, ref) {
    const base = ref || today();
    const n = daysBetween(base, iso);
    if (n === null) return '';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 0) return 'in ' + n + ' days';
    return -n + ' days ago';
  }

  /* -------------------------------------------------------------- money */
  /* Stored as integer pence. Floating-point pounds accumulate error fast
     once you start summing a year of transactions. */

  function toPence(pounds) {
    const n = Number(pounds);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function toPounds(pence) { return (Number(pence) || 0) / 100; }

  function formatMoney(pence, opts) {
    const o = opts || {};
    const symbol = o.symbol === undefined ? '£' : o.symbol;
    const n = Number(pence) || 0;
    const neg = n < 0;
    const abs = Math.abs(n);
    let body;
    if (o.compact && abs >= 100000) {
      // £1.2k / £15k — keeps big numbers readable on a phone.
      const k = abs / 100000;
      body = (k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'k';
    } else if (o.compact || o.round) {
      // Compact below the 'k' threshold still means whole pounds. Falling
      // back to pence here would put £701.70 next to £1.3k in the same row.
      body = String(Math.round(abs / 100));
      body = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    } else {
      body = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    const sign = neg ? '-' : (o.plus && n > 0 ? '+' : '');
    return sign + symbol + body;
  }

  // Accepts "12", "£12.50", "1,200", "12.5" -> pence. null when unparseable.
  function parseMoney(input) {
    if (input === null || input === undefined) return null;
    const s = String(input).trim().replace(/[£$€,\s]/g, '');
    if (s === '' || s === '-') return null;
    if (!/^-?\d*\.?\d*$/.test(s)) return null;
    const n = Number(s);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  }

  /* -------------------------------------------------------------- stats */

  function sum(xs) {
    let t = 0;
    for (let i = 0; i < xs.length; i++) t += Number(xs[i]) || 0;
    return t;
  }

  function mean(xs) { return xs.length ? sum(xs) / xs.length : null; }

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function stdev(xs) {
    if (xs.length < 2) return null;
    const m = mean(xs);
    const v = sum(xs.map(function (x) { return (x - m) * (x - m); })) / (xs.length - 1);
    return Math.sqrt(v);
  }

  // Pearson r. Returns null rather than a misleading number when the
  // sample is too small or either series is flat.
  function correlation(xs, ys, minN) {
    const n = Math.min(xs.length, ys.length);
    const need = minN == null ? 6 : minN;
    if (n < need) return null;
    const a = xs.slice(0, n), b = ys.slice(0, n);
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    if (da === 0 || db === 0) return null;
    return num / Math.sqrt(da * db);
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function round(n, dp) {
    const f = Math.pow(10, dp || 0);
    return Math.round(n * f) / f;
  }

  function pct(part, whole) {
    if (!whole) return null;
    return (part / whole) * 100;
  }

  /* ------------------------------------------------------------- misc */

  function groupBy(list, keyFn) {
    const out = {};
    for (let i = 0; i < list.length; i++) {
      const k = keyFn(list[i]);
      if (k === null || k === undefined) continue;
      (out[k] || (out[k] = [])).push(list[i]);
    }
    return out;
  }

  function sortBy(list, keyFn, dir) {
    const d = dir === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      const ka = keyFn(a), kb = keyFn(b);
      if (ka === kb) return 0;
      if (ka === null || ka === undefined) return 1;
      if (kb === null || kb === undefined) return -1;
      return ka < kb ? -d : d;
    });
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  // Title-cases a slug for display: 'car_boot' -> 'Car boot'
  function humanise(s) {
    const t = String(s || '').replace(/[_-]+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  K.Util = {
    uid: uid,
    pad2: pad2,
    toISODate: toISODate,
    fromISODate: fromISODate,
    isISODate: isISODate,
    today: today,
    addDays: addDays,
    addMonths: addMonths,
    daysBetween: daysBetween,
    startOfWeek: startOfWeek,
    endOfWeek: endOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    monthKey: monthKey,
    isoWeekKey: isoWeekKey,
    dateRange: dateRange,
    dayOfWeek: dayOfWeek,
    formatDate: formatDate,
    relativeDay: relativeDay,
    DAY_NAMES: DAY_NAMES,
    MONTH_NAMES: MONTH_NAMES,
    toPence: toPence,
    toPounds: toPounds,
    formatMoney: formatMoney,
    parseMoney: parseMoney,
    sum: sum,
    mean: mean,
    median: median,
    stdev: stdev,
    correlation: correlation,
    clamp: clamp,
    round: round,
    pct: pct,
    groupBy: groupBy,
    sortBy: sortBy,
    plural: plural,
    humanise: humanise
  };
})(globalThis.Keel = globalThis.Keel || {});
