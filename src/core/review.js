/* Keel — weekly review: one digest across every domain. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util, Money = K.Money, Habits = K.Habits, Work = K.Work,
    Health = K.Health, Tasks = K.Tasks, Insights = K.Insights;

  // The week under review is the one that just finished, unless today is
  // itself the review day, in which case it's the week ending today.
  function reviewWeekStart(state, refISO) {
    const ref = refISO || U.today();
    const thisWeek = U.startOfWeek(ref);
    return U.dayOfWeek(ref) >= state.settings.reviewWeekday
      ? thisWeek
      : U.addDays(thisWeek, -7);
  }

  function digest(state, weekStartISO, refISO) {
    const ref = refISO || U.today();
    const start = weekStartISO || reviewWeekStart(state, ref);
    const end = U.addDays(start, 6);
    const priorStart = U.addDays(start, -7);
    const priorEnd = U.addDays(start, -1);
    const days = U.dateRange(start, end);

    return {
      period: {
        start: start, end: end, key: U.isoWeekKey(start),
        label: U.formatDate(start, 'short') + ' – ' + U.formatDate(end, 'short'),
        complete: U.daysBetween(end, ref) >= 0
      },
      habits: habitsSection(state, start, end, days),
      tasks: tasksSection(state, start, end, priorStart, priorEnd, ref),
      money: moneySection(state, start, end, priorStart, priorEnd),
      work: workSection(state, start, end, ref),
      health: healthSection(state, start, end, days),
      journal: journalSection(state, days),
      insights: Insights.all(state, ref).slice(0, 5),
      scores: null // filled below
    };
  }

  function habitsSection(state, start, end, days) {
    const habits = Habits.activeHabits(state);
    const per = habits.map(function (h) {
      const target = h.cadence === 'daily' ? 7 : h.targetPerWeek;
      const done = Habits.weekDone(state, h, start);
      return {
        habit: h, done: done, target: target, met: done >= target,
        streak: Habits.streak(state, h, end).current
      };
    });
    const totalDone = U.sum(per.map(function (p) { return Math.min(p.done, p.target); }));
    const totalTarget = U.sum(per.map(function (p) { return p.target; }));
    return {
      perHabit: per,
      done: totalDone,
      target: totalTarget,
      pct: totalTarget ? (totalDone / totalTarget) * 100 : null,
      perfect: per.filter(function (p) { return p.met; }).length,
      count: per.length
    };
  }

  function tasksSection(state, start, end, priorStart, priorEnd, ref) {
    const completed = Tasks.completedIn(state, start, end);
    const prior = Tasks.completedIn(state, priorStart, priorEnd);
    const added = state.tasks.filter(function (t) {
      return U.daysBetween(start, t.createdAt) >= 0 && U.daysBetween(t.createdAt, end) >= 0;
    });
    return {
      completed: completed.length,
      completedList: completed,
      added: added.length,
      prior: prior.length,
      delta: completed.length - prior.length,
      overdueNow: Tasks.overdue(state, ref).length,
      stale: Tasks.stale(state, 30, ref).slice(0, 5)
    };
  }

  function moneySection(state, start, end, priorStart, priorEnd) {
    const cur = Money.summarise(Money.transactionsIn(state, start, end));
    const prior = Money.summarise(Money.transactionsIn(state, priorStart, priorEnd));

    // The eight weeks before this one, as a baseline to judge the week
    // against. Income for a reseller or freelancer arrives in lumps, so the
    // only fair comparison for a single week is the person's own normal.
    const baselineWeeks = [];
    for (let i = 1; i <= 8; i++) {
      const ws = U.addDays(start, -7 * i);
      const we = U.addDays(ws, 6);
      const sum = Money.summarise(Money.transactionsIn(state, ws, we));
      if (sum.count > 0) baselineWeeks.push(sum);
    }
    const baselineExpense = baselineWeeks.length >= 2
      ? Math.round(U.mean(baselineWeeks.map(function (w) { return w.expensePence; })))
      : null;
    const cats = U.sortBy(Object.keys(cur.byCategory).map(function (c) {
      return { category: c, pence: cur.byCategory[c] };
    }), function (c) { return c.pence; }, 'desc');
    const streams = U.sortBy(Object.keys(cur.byStream).map(function (s) {
      return { stream: s, pence: cur.byStream[s] };
    }), function (s) { return s.pence; }, 'desc');
    return {
      incomePence: cur.incomePence,
      expensePence: cur.expensePence,
      netPence: cur.netPence,
      priorNetPence: prior.netPence,
      deltaPence: cur.netPence - prior.netPence,
      baselineExpensePence: baselineExpense,
      baselineWeeks: baselineWeeks.length,
      topCategories: cats.slice(0, 5),
      streams: streams,
      count: cur.count
    };
  }

  function workSection(state, start, end, ref) {
    const sent = Work.applicationsInRange(state, start, end);
    const moved = state.applications.filter(function (a) {
      return U.daysBetween(start, a.updatedAt) >= 0 && U.daysBetween(a.updatedAt, end) >= 0
        && a.appliedDate !== a.updatedAt;
    });
    const gigsWon = state.gigs.filter(function (g) {
      return (g.status === 'booked' || g.status === 'in_progress')
        && U.daysBetween(start, g.updatedAt) >= 0 && U.daysBetween(g.updatedAt, end) >= 0;
    });
    const gigsPaid = state.gigs.filter(function (g) {
      return g.status === 'paid'
        && U.daysBetween(start, g.updatedAt) >= 0 && U.daysBetween(g.updatedAt, end) >= 0;
    });
    return {
      applicationsSent: sent.length,
      applicationsMoved: moved.length,
      interviews: state.applications.filter(function (a) {
        return ['interview', 'final'].indexOf(a.status) >= 0;
      }).length,
      gigsWon: gigsWon.length,
      gigsPaid: gigsPaid.length,
      followUps: Work.needsFollowUp(state, ref).length,
      pipeline: Work.pipelineValue(state),
      unpaidPence: Work.unpaid(state).totalPence
    };
  }

  function healthSection(state, start, end, days) {
    function avg(field) {
      const vals = [];
      days.forEach(function (d) {
        const c = state.checkins[d];
        if (c && c[field] !== null && c[field] !== undefined) vals.push(c[field]);
      });
      return vals.length ? { value: U.mean(vals), sample: vals.length } : null;
    }
    let logged = 0, moveDays = 0;
    days.forEach(function (d) {
      if (Health.hasAny(state, d)) logged++;
      const c = state.checkins[d];
      if (c && c.exerciseMins) moveDays++;
    });
    return {
      sleep: avg('sleepHours'),
      energy: avg('energy'),
      mood: avg('mood'),
      exercise: avg('exerciseMins'),
      loggedDays: logged,
      moveDays: moveDays,
      possibleDays: days.length
    };
  }

  function journalSection(state, days) {
    const entries = [];
    days.forEach(function (d) {
      const j = state.journal[d];
      if (j) entries.push({ date: d, entry: j });
    });
    return {
      count: entries.length,
      entries: entries,
      wins: entries.filter(function (e) { return e.entry.win; })
        .map(function (e) { return { date: e.date, text: e.entry.win }; }),
      lessons: entries.filter(function (e) { return e.entry.lesson; })
        .map(function (e) { return { date: e.date, text: e.entry.lesson }; })
    };
  }

  /* --------------------------------------------------------------- scores */
  /* Each domain scores 0–100, and only when there is something to score.
     A domain you never logged returns null rather than zero — scoring an
     unlogged week as a failed one is how these tools end up in the bin. */

  function scores(d) {
    const out = {};

    out.habits = d.habits.pct === null ? null : Math.round(U.clamp(d.habits.pct, 0, 100));

    // Tasks: relative to the previous week, so it adapts to your own pace
    // instead of an invented quota.
    if (d.tasks.completed === 0 && d.tasks.prior === 0) out.tasks = null;
    else if (d.tasks.prior === 0) out.tasks = d.tasks.completed > 0 ? 75 : 0;
    else out.tasks = Math.round(U.clamp((d.tasks.completed / d.tasks.prior) * 60, 0, 100));

    // Money: judged against your own recent weeks, not a weekly budget you
    // never set. Wages and reselling payouts arrive in lumps, so scoring a
    // week's net directly would mark down every week the money simply
    // didn't happen to land in.
    if (d.money.count === 0 || d.money.baselineExpensePence === null) {
      out.money = null;
    } else {
      const ratio = d.money.expensePence / Math.max(d.money.baselineExpensePence, 1);
      // Spending at your usual rate is a 50. Half of it is 75, double is 0.
      let m = 100 - ratio * 50;
      if (d.money.netPence > 0) m += 20; // a week that ended up ahead
      out.money = Math.round(U.clamp(m, 0, 100));
    }

    // Health: sleep, mood and movement, each contributing only if logged.
    // Movement is measured against the days actually logged, not all seven:
    // scoring it against the week would turn every day you forgot to write
    // anything down into a day you did nothing.
    const parts = [];
    if (d.health.sleep) parts.push(U.clamp((d.health.sleep.value / 8) * 100, 0, 100));
    if (d.health.mood) parts.push(((d.health.mood.value - 1) / 4) * 100);
    if (d.health.energy) parts.push(((d.health.energy.value - 1) / 4) * 100);
    if (d.health.loggedDays) parts.push((d.health.moveDays / d.health.loggedDays) * 100);
    out.health = parts.length ? Math.round(U.mean(parts)) : null;

    // Work: forward motion counts, but a quiet week spent waiting on people
    // who have your application is not a failed week. With a live pipeline
    // the floor is 30, not zero.
    const w = d.work;
    const motion = w.applicationsSent + w.applicationsMoved + w.gigsWon + w.gigsPaid;
    const livePipeline = w.pipeline.applications.count + w.pipeline.gigs.count;
    if (motion === 0 && livePipeline === 0) out.work = null;
    else out.work = Math.round(U.clamp((livePipeline ? 30 : 0) + motion * 18, 0, 100));

    const present = Object.keys(out).filter(function (k) { return out[k] !== null; });
    out.overall = present.length
      ? Math.round(U.mean(present.map(function (k) { return out[k]; })))
      : null;
    out.domainsScored = present.length;
    return out;
  }

  function fullDigest(state, weekStartISO, refISO) {
    const d = digest(state, weekStartISO, refISO);
    d.scores = scores(d);
    return d;
  }

  function savedReview(state, weekKey) {
    for (let i = 0; i < state.reviews.length; i++) {
      if (state.reviews[i].weekKey === weekKey) return state.reviews[i];
    }
    return null;
  }

  // Weeks worth offering in the review picker: any week that has data.
  function weeksWithData(state, limit, refISO) {
    const ref = refISO || U.today();
    const n = limit == null ? 26 : limit;
    const out = [];
    for (let i = 0; i < n; i++) {
      const start = U.addDays(U.startOfWeek(ref), -7 * i);
      const end = U.addDays(start, 6);
      const days = U.dateRange(start, end);
      const has = days.some(function (d) {
        return state.habitLog[d] || state.checkins[d] || state.journal[d];
      }) || Money.transactionsIn(state, start, end).length > 0
        || Tasks.completedIn(state, start, end).length > 0;
      if (has || i === 0) {
        out.push({ start: start, end: end, key: U.isoWeekKey(start) });
      }
    }
    return out;
  }

  K.Review = {
    reviewWeekStart: reviewWeekStart,
    digest: digest,
    fullDigest: fullDigest,
    scores: scores,
    savedReview: savedReview,
    weeksWithData: weeksWithData
  };
})(globalThis.Keel = globalThis.Keel || {});
