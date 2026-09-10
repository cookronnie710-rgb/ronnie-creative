/* Keel — habits: ticks, streaks, completion, heatmap. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util;

  function isDone(state, habitId, day) {
    const d = state.habitLog[day];
    return !!(d && d[habitId]);
  }

  function doneCount(state, day) {
    const d = state.habitLog[day];
    return d ? Object.keys(d).length : 0;
  }

  function activeHabits(state) {
    return U.sortBy(state.habits.filter(function (h) { return !h.archived; }),
      function (h) { return h.order; });
  }

  // Earliest day we have any tick for — the natural left edge for
  // "best streak" scans, so we never walk back to 1970.
  function firstLoggedDay(state, habitId) {
    let min = null;
    Object.keys(state.habitLog).forEach(function (day) {
      if (habitId && !state.habitLog[day][habitId]) return;
      if (min === null || day < min) min = day;
    });
    return min;
  }

  function weekDone(state, habit, weekStartISO) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      if (isDone(state, habit.id, U.addDays(weekStartISO, i))) n++;
    }
    return n;
  }

  function weekProgress(state, habit, refISO) {
    const ref = refISO || U.today();
    const start = U.startOfWeek(ref);
    const target = habit.cadence === 'daily' ? 7 : habit.targetPerWeek;
    const done = weekDone(state, habit, start);
    return {
      weekStart: start,
      done: done,
      target: target,
      met: done >= target,
      remaining: Math.max(0, target - done)
    };
  }

  /* -------------------------------------------------------------- streak */

  // The day in progress never breaks a streak. A habit you have not done
  // *yet today* is not a habit you have broken, and an app that says
  // otherwise at 9am trains people to ignore it.
  function streak(state, habit, refISO) {
    const ref = refISO || U.today();
    return habit.cadence === 'weekly'
      ? weeklyStreak(state, habit, ref)
      : dailyStreak(state, habit, ref);
  }

  function dailyStreak(state, habit, ref) {
    const first = firstLoggedDay(state, habit.id);
    let current = 0;
    let cursor = ref;

    if (!isDone(state, habit.id, ref)) cursor = U.addDays(ref, -1);
    let guard = 0;
    while (isDone(state, habit.id, cursor) && guard++ < 3660) {
      current++;
      cursor = U.addDays(cursor, -1);
    }

    let best = current, run = 0;
    if (first) {
      const days = U.dateRange(first, ref);
      for (let i = 0; i < days.length; i++) {
        if (isDone(state, habit.id, days[i])) {
          run++;
          if (run > best) best = run;
        } else run = 0;
      }
    }

    return {
      unit: 'day',
      current: current,
      best: best,
      doneToday: isDone(state, habit.id, ref),
      lastDone: lastDone(state, habit.id, ref)
    };
  }

  function weeklyStreak(state, habit, ref) {
    const first = firstLoggedDay(state, habit.id);
    const thisWeek = U.startOfWeek(ref);
    const target = habit.targetPerWeek;

    let current = 0;
    let cursor = thisWeek;
    if (weekDone(state, habit, thisWeek) < target) cursor = U.addDays(thisWeek, -7);
    let guard = 0;
    while (weekDone(state, habit, cursor) >= target && guard++ < 520) {
      current++;
      cursor = U.addDays(cursor, -7);
    }

    let best = current, run = 0;
    if (first) {
      let w = U.startOfWeek(first);
      let g2 = 0;
      while (U.daysBetween(w, thisWeek) >= 0 && g2++ < 520) {
        if (weekDone(state, habit, w) >= target) {
          run++;
          if (run > best) best = run;
        } else run = 0;
        w = U.addDays(w, 7);
      }
    }

    return {
      unit: 'week',
      current: current,
      best: best,
      doneToday: isDone(state, habit.id, ref),
      lastDone: lastDone(state, habit.id, ref)
    };
  }

  function lastDone(state, habitId, refISO) {
    let best = null;
    Object.keys(state.habitLog).forEach(function (day) {
      if (!state.habitLog[day][habitId]) return;
      if (U.daysBetween(day, refISO) < 0) return; // ignore future ticks
      if (best === null || day > best) best = day;
    });
    return best;
  }

  /* ---------------------------------------------------------- completion */

  function completionRate(state, habit, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 30 : days;
    const from = U.addDays(ref, -(n - 1));

    if (habit.cadence === 'daily') {
      let done = 0;
      const range = U.dateRange(from, ref);
      range.forEach(function (d) { if (isDone(state, habit.id, d)) done++; });
      return { done: done, possible: range.length, pct: range.length ? (done / range.length) * 100 : null };
    }

    // Weekly habits are scored per completed week against their target.
    let done = 0, possible = 0;
    let w = U.startOfWeek(from);
    const end = U.startOfWeek(ref);
    let guard = 0;
    while (U.daysBetween(w, end) >= 0 && guard++ < 520) {
      done += Math.min(weekDone(state, habit, w), habit.targetPerWeek);
      possible += habit.targetPerWeek;
      w = U.addDays(w, 7);
    }
    return { done: done, possible: possible, pct: possible ? (done / possible) * 100 : null };
  }

  // Overall adherence across every active habit — the single number the
  // Today screen and weekly review both lean on.
  function overallRate(state, days, refISO) {
    const habits = activeHabits(state);
    if (!habits.length) return null;
    let done = 0, possible = 0;
    habits.forEach(function (h) {
      const r = completionRate(state, h, days, refISO);
      done += r.done;
      possible += r.possible;
    });
    return possible ? (done / possible) * 100 : null;
  }

  /* ------------------------------------------------------------- heatmap */

  // Weeks x 7 grid, Monday-first, oldest week first — the shape a calendar
  // grid wants to render directly.
  function heatmap(state, habit, weeks, refISO) {
    const ref = refISO || U.today();
    const n = weeks == null ? 12 : weeks;
    const thisWeek = U.startOfWeek(ref);
    const start = U.addDays(thisWeek, -7 * (n - 1));
    const grid = [];
    for (let w = 0; w < n; w++) {
      const row = [];
      const weekStart = U.addDays(start, w * 7);
      for (let d = 0; d < 7; d++) {
        const day = U.addDays(weekStart, d);
        const future = U.daysBetween(ref, day) > 0;
        row.push({
          date: day,
          done: habit ? isDone(state, habit.id, day) : doneCount(state, day) > 0,
          count: habit ? (isDone(state, habit.id, day) ? 1 : 0) : doneCount(state, day),
          future: future
        });
      }
      grid.push({ weekStart: weekStart, days: row });
    }
    return grid;
  }

  /* --------------------------------------------------------- today view */

  // Everything the Today screen needs per habit, in one pass.
  function todayView(state, refISO) {
    const ref = refISO || U.today();
    return activeHabits(state).map(function (h) {
      const st = streak(state, h, ref);
      const wp = weekProgress(state, h, ref);
      return {
        habit: h,
        done: isDone(state, h.id, ref),
        streak: st,
        week: wp,
        // A weekly habit is only "needed" if the week's target is still open.
        needed: h.cadence === 'daily' ? !isDone(state, h.id, ref) : !wp.met
      };
    });
  }

  // Habits that have quietly lapsed — surfaced in the weekly review rather
  // than nagged about daily.
  function slipping(state, refISO) {
    const ref = refISO || U.today();
    return activeHabits(state).map(function (h) {
      const recent = completionRate(state, h, 14, ref);
      const prior = completionRate(state, h, 28, U.addDays(ref, -14));
      return {
        habit: h,
        recentPct: recent.pct,
        priorPct: prior.pct,
        delta: (recent.pct !== null && prior.pct !== null) ? recent.pct - prior.pct : null
      };
    }).filter(function (r) {
      return r.delta !== null && r.delta <= -20 && r.priorPct >= 40;
    });
  }

  K.Habits = {
    isDone: isDone,
    doneCount: doneCount,
    activeHabits: activeHabits,
    firstLoggedDay: firstLoggedDay,
    weekDone: weekDone,
    weekProgress: weekProgress,
    streak: streak,
    lastDone: lastDone,
    completionRate: completionRate,
    overallRate: overallRate,
    heatmap: heatmap,
    todayView: todayView,
    slipping: slipping
  };
})(globalThis.Keel = globalThis.Keel || {});
