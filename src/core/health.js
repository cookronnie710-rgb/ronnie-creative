/* Keel — daily check-ins: sleep, energy, mood, movement. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util;

  const FIELDS = [
    { id: 'sleepHours', label: 'Sleep', unit: 'h', min: 0, max: 14, step: 0.5, good: 'high' },
    { id: 'energy', label: 'Energy', unit: '/5', min: 1, max: 5, step: 1, good: 'high' },
    { id: 'mood', label: 'Mood', unit: '/5', min: 1, max: 5, step: 1, good: 'high' },
    { id: 'exerciseMins', label: 'Movement', unit: 'min', min: 0, max: 240, step: 5, good: 'high' },
    { id: 'water', label: 'Water', unit: ' glasses', min: 0, max: 15, step: 1, good: 'high' },
    { id: 'weightKg', label: 'Weight', unit: 'kg', min: 30, max: 250, step: 0.1, good: 'none' }
  ];

  function fieldMeta(id) {
    for (let i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return FIELDS[i];
    return null;
  }

  function get(state, day) { return state.checkins[day] || null; }

  function hasAny(state, day) {
    const c = get(state, day);
    if (!c) return false;
    return FIELDS.some(function (f) { return c[f.id] !== null && c[f.id] !== undefined; })
      || !!c.note;
  }

  // Only days where the field was actually recorded. Missing days are
  // omitted rather than zero-filled — a day you forgot to log is not a
  // day you slept zero hours.
  function series(state, field, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 30 : days;
    const from = U.addDays(ref, -(n - 1));
    const out = [];
    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      const v = c ? c[field] : null;
      if (v !== null && v !== undefined) out.push({ date: d, value: v });
    });
    return out;
  }

  function average(state, field, days, refISO) {
    const s = series(state, field, days, refISO);
    if (!s.length) return null;
    return { value: U.mean(s.map(function (p) { return p.value; })), sample: s.length };
  }

  function averages(state, days, refISO) {
    const out = {};
    FIELDS.forEach(function (f) { out[f.id] = average(state, f.id, days, refISO); });
    return out;
  }

  // Recent window against the window before it. Needs three points on each
  // side before it will claim a direction.
  function trend(state, field, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 14 : days;
    const recent = series(state, field, n, ref);
    const prior = series(state, field, n, U.addDays(ref, -n));
    if (recent.length < 3 || prior.length < 3) return null;
    const a = U.mean(recent.map(function (p) { return p.value; }));
    const b = U.mean(prior.map(function (p) { return p.value; }));
    return {
      recent: a, prior: b, delta: a - b,
      deltaPct: b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null,
      sample: recent.length + prior.length
    };
  }

  // Days where both fields were logged — the paired sample any comparison
  // between two measures has to be built from.
  function pairedDays(state, fieldA, fieldB, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 90 : days;
    const from = U.addDays(ref, -(n - 1));
    const xs = [], ys = [], dates = [];
    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      if (!c) return;
      const a = c[fieldA], b = c[fieldB];
      if (a === null || a === undefined || b === null || b === undefined) return;
      xs.push(a); ys.push(b); dates.push(d);
    });
    return { xs: xs, ys: ys, dates: dates, n: xs.length };
  }

  function logStreak(state, refISO) {
    const ref = refISO || U.today();
    let cursor = hasAny(state, ref) ? ref : U.addDays(ref, -1);
    let n = 0, guard = 0;
    while (hasAny(state, cursor) && guard++ < 3660) {
      n++;
      cursor = U.addDays(cursor, -1);
    }
    return n;
  }

  function loggedDays(state, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 30 : days;
    const range = U.dateRange(U.addDays(ref, -(n - 1)), ref);
    let c = 0;
    range.forEach(function (d) { if (hasAny(state, d)) c++; });
    return { logged: c, possible: range.length };
  }

  K.Health = {
    FIELDS: FIELDS,
    fieldMeta: fieldMeta,
    get: get,
    hasAny: hasAny,
    series: series,
    average: average,
    averages: averages,
    trend: trend,
    pairedDays: pairedDays,
    logStreak: logStreak,
    loggedDays: loggedDays
  };
})(globalThis.Keel = globalThis.Keel || {});
