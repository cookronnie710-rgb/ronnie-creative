/* Keel — tasks and projects. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util;

  function open(state) {
    return state.tasks.filter(function (t) { return !t.done; });
  }

  function active(state) {
    return open(state).filter(function (t) { return !t.someday; });
  }

  function overdue(state, refISO) {
    const ref = refISO || U.today();
    return active(state).filter(function (t) {
      return t.dueDate && U.daysBetween(ref, t.dueDate) < 0;
    });
  }

  function dueToday(state, refISO) {
    const ref = refISO || U.today();
    return active(state).filter(function (t) {
      return t.dueDate && U.daysBetween(ref, t.dueDate) === 0;
    });
  }

  function dueWithin(state, days, refISO) {
    const ref = refISO || U.today();
    return active(state).filter(function (t) {
      if (!t.dueDate) return false;
      const d = U.daysBetween(ref, t.dueDate);
      return d !== null && d >= 0 && d <= days;
    });
  }

  // What the Today screen shows: everything overdue or due today, hardest
  // first, then a couple of undated high-priority items so the list is
  // never empty on a day with no deadlines.
  function todayList(state, refISO, fill) {
    const ref = refISO || U.today();
    const urgent = U.sortBy(overdue(state, ref).concat(dueToday(state, ref)),
      function (t) { return t.dueDate + '|' + (9 - t.priority); });
    const want = fill == null ? 5 : fill;
    if (urgent.length >= want) return urgent;

    const seen = {};
    urgent.forEach(function (t) { seen[t.id] = true; });
    const undated = active(state).filter(function (t) {
      return !seen[t.id] && !t.dueDate;
    });
    // Two stable passes rather than one composite key: concatenating a
    // negative number into a string sorts -1 before -3, which quietly
    // inverts the priority order.
    const rest = U.sortBy(
      U.sortBy(undated, function (t) { return t.createdAt; }),
      function (t) { return -t.priority; }
    );

    return urgent.concat(rest.slice(0, want - urgent.length));
  }

  function completedIn(state, fromISO, toISO) {
    return state.tasks.filter(function (t) {
      if (!t.done || !t.doneDate) return false;
      return U.daysBetween(fromISO, t.doneDate) >= 0 && U.daysBetween(t.doneDate, toISO) >= 0;
    });
  }

  function byProject(state) {
    const groups = state.projects.filter(function (p) { return !p.archived; })
      .map(function (p) {
        const all = state.tasks.filter(function (t) { return t.projectId === p.id; });
        return {
          project: p,
          tasks: all,
          open: all.filter(function (t) { return !t.done; }).length,
          done: all.filter(function (t) { return t.done; }).length
        };
      });
    const loose = state.tasks.filter(function (t) { return !t.projectId; });
    if (loose.length) {
      groups.push({
        project: { id: null, name: 'No project', color: 'slate' },
        tasks: loose,
        open: loose.filter(function (t) { return !t.done; }).length,
        done: loose.filter(function (t) { return t.done; }).length
      });
    }
    return groups;
  }

  // Open tasks that have sat untouched for a long time. Usually these want
  // deleting or demoting to someday, not doing.
  function stale(state, days, refISO) {
    const ref = refISO || U.today();
    const n = days == null ? 30 : days;
    return active(state).filter(function (t) {
      const age = U.daysBetween(t.createdAt, ref);
      return age !== null && age >= n;
    }).map(function (t) {
      return { task: t, ageDays: U.daysBetween(t.createdAt, ref) };
    }).sort(function (a, b) { return b.ageDays - a.ageDays; });
  }

  function throughput(state, weeks, refISO) {
    const ref = refISO || U.today();
    const n = weeks == null ? 8 : weeks;
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = U.addDays(U.startOfWeek(ref), -7 * i);
      const end = U.addDays(start, 6);
      out.push({
        weekStart: start,
        weekKey: U.isoWeekKey(start),
        completed: completedIn(state, start, end).length
      });
    }
    return out;
  }

  function counts(state, refISO) {
    const ref = refISO || U.today();
    return {
      open: open(state).length,
      active: active(state).length,
      someday: open(state).filter(function (t) { return t.someday; }).length,
      overdue: overdue(state, ref).length,
      dueToday: dueToday(state, ref).length,
      done: state.tasks.filter(function (t) { return t.done; }).length
    };
  }

  K.Tasks = {
    open: open,
    active: active,
    overdue: overdue,
    dueToday: dueToday,
    dueWithin: dueWithin,
    todayList: todayList,
    completedIn: completedIn,
    byProject: byProject,
    stale: stale,
    throughput: throughput,
    counts: counts
  };
})(globalThis.Keel = globalThis.Keel || {});
