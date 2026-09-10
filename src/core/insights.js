/* Keel — insights: cross-domain observations. Pure logic.
 *
 * House rules for anything generated here:
 *   1. Never claim a pattern without a stated sample size.
 *   2. Never say "because". These are associations, not causes.
 *   3. Stay quiet when there isn't enough data. An empty insights list is
 *      an honest answer; a confident one built on four data points is not.
 */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model, Money = K.Money, Habits = K.Habits,
    Work = K.Work, Health = K.Health, Tasks = K.Tasks;

  const MIN_PAIRED = 10;      // days needed before comparing two measures
  const MIN_GROUP = 5;        // days needed in each side of a split
  const MIN_R = 0.4;          // correlation worth mentioning at all

  const SEVERITY_ORDER = { urgent: 0, warn: 1, good: 2, info: 3 };

  function make(o) {
    return {
      id: o.id,
      domain: o.domain,
      severity: o.severity || 'info',
      title: o.title,
      detail: o.detail || '',
      route: o.route || null,
      sample: o.sample || null
    };
  }

  /* --------------------------------------------------------------- money */

  function moneyInsights(state, ref) {
    const out = [];
    const r = Money.runway(state, ref);

    if (r.basis === 'none') {
      out.push(make({
        id: 'money-empty', domain: 'money', severity: 'info',
        title: 'Money is unset',
        detail: 'Add your cash balance and a few recurring items and Keel can work out your runway.',
        route: '#/money'
      }));
    } else if (r.status === 'critical') {
      out.push(make({
        id: 'money-runway-critical', domain: 'money', severity: 'urgent',
        title: 'Under a month of runway',
        detail: 'At the current rate your cash runs out around ' +
          U.formatDate(r.zeroDate, 'medium') + '. Worth cutting an outgoing or pulling income forward.',
        route: '#/money'
      }));
    } else if (r.status === 'low') {
      out.push(make({
        id: 'money-runway-low', domain: 'money', severity: 'warn',
        title: U.round(r.months, 1) + ' months of runway',
        detail: 'Below your ' + U.plural(state.settings.runwayWarnMonths, 'month') +
          ' comfort line. Zero point is around ' + U.formatDate(r.zeroDate, 'medium') + '.',
        route: '#/money'
      }));
    } else if (r.status === 'growing' && r.netPence > 0) {
      out.push(make({
        id: 'money-growing', domain: 'money', severity: 'good',
        title: 'Cash is growing',
        detail: 'You are net positive by ' + U.formatMoney(r.netPence) + ' a month on ' +
          (r.basis === 'actual' ? 'logged transactions' : 'your recurring plan') + '.',
        route: '#/money'
      }));
    }

    // Which income stream is actually carrying the month.
    const cov = Money.streamCoverage(state, ref);
    if (cov.months >= 2 && cov.streams.length && cov.expensePence > 0) {
      const top = cov.streams[0];
      if (top.coveragePct !== null) {
        out.push(make({
          id: 'money-stream-top', domain: 'money', severity: 'info',
          title: top.label + ' covers ' + Math.round(top.coveragePct) + '% of outgoings',
          detail: 'Averaging ' + U.formatMoney(top.monthlyPence) + ' a month across ' +
            U.plural(cov.months, 'month') + '.',
          route: '#/money', sample: cov.months
        }));
      }
    }

    // A category that has jumped against its own recent baseline.
    const spike = categorySpike(state, ref);
    if (spike) {
      out.push(make({
        id: 'money-spike-' + spike.category, domain: 'money', severity: 'warn',
        title: U.humanise(spike.category) + ' spending is up',
        detail: U.formatMoney(spike.thisMonthPence) + ' in the first ' +
          U.plural(spike.dayOfMonth, 'day') + ' of this month, against ' +
          U.formatMoney(spike.baselinePence) + ' by the same point over the previous ' +
          U.plural(spike.months, 'month') + '.',
        route: '#/money', sample: spike.months
      }));
    }

    // Goals that will not arrive on the date attached to them.
    const surplus = Math.max(0, Money.burnEstimate(state, ref).netPence);
    state.money.goals.filter(function (g) { return !g.archived && g.targetDate; })
      .forEach(function (g) {
        const p = Money.goalProjection(g, surplus, ref);
        if (p.onTrack === false && p.requiredMonthlyPence) {
          out.push(make({
            id: 'goal-behind-' + g.id, domain: 'money', severity: 'warn',
            title: '"' + g.label + '" is behind',
            detail: 'Needs ' + U.formatMoney(p.requiredMonthlyPence) + ' a month to land by ' +
              U.formatDate(g.targetDate, 'medium') + '; currently putting aside ' +
              U.formatMoney(p.monthlyPence) + '.',
            route: '#/money'
          }));
        }
      });

    return out;
  }

  // Compares this month so far against the same stretch of previous months.
  // Projecting a part-month linearly looks tempting and is wrong: rent, the
  // big shop and stock buys all land early, so a naive projection reports a
  // spike in almost every category by the 10th.
  function categorySpike(state, ref) {
    const dayOfMonth = Number(String(ref).slice(8, 10));
    if (dayOfMonth < 7) return null; // too early to compare anything

    const monthStart = U.startOfMonth(ref);
    const current = Money.summarise(Money.transactionsIn(state, monthStart, ref));
    if (current.count < 3) return null;

    // The same opening stretch of each previous month.
    const priors = [];
    for (let i = 1; i <= 3; i++) {
      const start = U.startOfMonth(U.addMonths(monthStart, -i));
      const lastDay = Number(String(U.endOfMonth(start)).slice(8, 10));
      const end = U.addDays(start, Math.min(dayOfMonth, lastDay) - 1);
      const sum = Money.summarise(Money.transactionsIn(state, start, end));
      if (sum.count > 0) priors.push(sum);
    }
    if (priors.length < 2) return null;

    let worst = null;
    Object.keys(current.byCategory).forEach(function (cat) {
      const now = current.byCategory[cat];
      const base = U.mean(priors.map(function (m) { return m.byCategory[cat] || 0; }));
      if (base < 1000) return;            // ignore sub-£10 baselines
      if (now < base * 1.4) return;       // needs to be a real jump
      const excess = now - base;
      if (!worst || excess > worst.excess) {
        worst = {
          category: cat, excess: excess, months: priors.length,
          dayOfMonth: dayOfMonth,
          thisMonthPence: Math.round(now),
          baselinePence: Math.round(base)
        };
      }
    });
    return worst;
  }

  /* ---------------------------------------------------------------- work */

  function workInsights(state, ref) {
    const out = [];

    const follow = Work.needsFollowUp(state, ref);
    if (follow.length) {
      const worst = follow[0];
      out.push(make({
        id: 'work-followup', domain: 'work', severity: 'warn',
        title: U.plural(follow.length, 'application') + ' gone quiet',
        detail: 'Longest is ' + worst.application.company + ' at ' +
          U.plural(worst.silentDays, 'day') + ' with no contact. A short nudge costs nothing.',
        route: '#/work'
      }));
    }

    const owed = Work.unpaid(state);
    if (owed.totalPence > 0) {
      out.push(make({
        id: 'work-unpaid', domain: 'work', severity: owed.totalPence > 50000 ? 'urgent' : 'warn',
        title: U.formatMoney(owed.totalPence) + ' owed to you',
        detail: 'Across ' + U.plural(owed.items.length, 'job') + '. Chasing an invoice is the ' +
          'best-paid hour in freelancing.',
        route: '#/work'
      }));
    }

    const late = Work.overdueGigs(state, ref);
    if (late.length) {
      out.push(make({
        id: 'work-overdue-gigs', domain: 'work', severity: 'urgent',
        title: U.plural(late.length, 'job') + ' past the deadline',
        detail: late.map(function (l) {
          return l.gig.client + ' (' + U.plural(l.overdueDays, 'day') + ' over)';
        }).join(', ') + '.',
        route: '#/work'
      }));
    }

    const rr = Work.responseRate(state, ref);
    if (rr.sample >= 8) {
      const low = rr.pct < 15;
      out.push(make({
        id: 'work-response-rate', domain: 'work', severity: low ? 'warn' : 'info',
        title: Math.round(rr.pct) + '% response rate',
        detail: rr.responded + ' of ' + rr.sample + ' applications got a reply.' +
          (low ? ' A rate this low usually points at the CV or the targeting, not the volume.' : ''),
        route: '#/work', sample: rr.sample
      }));
    }

    const acc = Work.estimateAccuracy(state);
    if (acc && acc.medianRatio >= 1.25) {
      out.push(make({
        id: 'work-estimates', domain: 'work', severity: 'info',
        title: 'Jobs run ' + Math.round((acc.medianRatio - 1) * 100) + '% over estimate',
        detail: 'Median across ' + U.plural(acc.jobs, 'finished job') +
          '. Quoting ' + acc.medianRatio.toFixed(1) + 'x your gut estimate would have been about right.',
        route: '#/work', sample: acc.jobs
      }));
    }

    const rate = Work.effectiveRate(state);
    if (rate && rate.jobs >= 3) {
      out.push(make({
        id: 'work-rate', domain: 'work', severity: 'info',
        title: U.formatMoney(rate.pencePerHour) + ' an hour, realised',
        detail: 'Across ' + U.plural(rate.jobs, 'paid job') + ' and ' + rate.hours + ' logged hours.',
        route: '#/work', sample: rate.jobs
      }));
    }

    return out;
  }

  /* -------------------------------------------------------------- habits */

  function habitInsights(state, ref) {
    const out = [];
    const habits = Habits.activeHabits(state);
    if (!habits.length) return out;

    habits.forEach(function (h) {
      const st = Habits.streak(state, h, ref);
      // Milestones only, so this doesn't fire every single day.
      if ([7, 14, 30, 50, 100, 200, 365].indexOf(st.current) >= 0) {
        out.push(make({
          id: 'habit-streak-' + h.id + '-' + st.current, domain: 'habits', severity: 'good',
          title: h.emoji + ' ' + st.current + ' ' + st.unit + ' streak on "' + h.name + '"',
          detail: st.current >= st.best ? 'That is your best run yet.' :
            'Best so far is ' + st.best + '.',
          route: '#/habits'
        }));
      }
    });

    Habits.slipping(state, ref).forEach(function (s) {
      out.push(make({
        id: 'habit-slipping-' + s.habit.id, domain: 'habits', severity: 'warn',
        title: '"' + s.habit.name + '" is slipping',
        detail: Math.round(s.recentPct) + '% over the last fortnight, down from ' +
          Math.round(s.priorPct) + '%. Shrink it rather than drop it.',
        route: '#/habits'
      }));
    });

    // Which weekday consistently goes worst — usually a scheduling problem
    // rather than a willpower one.
    const weak = weakestWeekday(state, ref);
    if (weak) {
      out.push(make({
        id: 'habit-weekday', domain: 'habits', severity: 'info',
        title: weak.name + ' is your weakest day',
        detail: Math.round(weak.pct) + '% habit completion on ' + weak.name + 's against ' +
          Math.round(weak.otherPct) + '% the rest of the week, over ' +
          U.plural(weak.sample, 'week') + '.',
        route: '#/habits', sample: weak.sample
      }));
    }

    return out;
  }

  function weakestWeekday(state, ref) {
    const habits = Habits.activeHabits(state).filter(function (h) { return h.cadence === 'daily'; });
    if (!habits.length) return null;

    const start = U.addDays(U.startOfWeek(ref), -7 * 8); // 8 whole weeks back
    const days = U.dateRange(start, U.addDays(ref, -1));
    if (days.length < 28) return null;

    const byDow = [[], [], [], [], [], [], []];
    days.forEach(function (d) {
      let done = 0;
      habits.forEach(function (h) { if (Habits.isDone(state, h.id, d)) done++; });
      byDow[U.dayOfWeek(d)].push(done / habits.length);
    });

    let worst = null;
    for (let i = 0; i < 7; i++) {
      if (byDow[i].length < 4) return null; // need a real sample on every day
      const m = U.mean(byDow[i]);
      if (!worst || m < worst.mean) worst = { dow: i, mean: m };
    }

    const others = [];
    for (let i = 0; i < 7; i++) if (i !== worst.dow) others.push.apply(others, byDow[i]);
    const otherMean = U.mean(others);

    // Only worth saying if the gap is substantial.
    if (otherMean - worst.mean < 0.2) return null;

    return {
      name: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][worst.dow],
      pct: worst.mean * 100,
      otherPct: otherMean * 100,
      sample: Math.round(days.length / 7)
    };
  }

  /* -------------------------------------------------------------- health */

  function healthInsights(state, ref) {
    const out = [];

    const sleep = Health.trend(state, 'sleepHours', 14, ref);
    if (sleep && Math.abs(sleep.delta) >= 0.5) {
      const down = sleep.delta < 0;
      out.push(make({
        id: 'health-sleep-trend', domain: 'health', severity: down ? 'warn' : 'good',
        title: 'Sleep is ' + (down ? 'down' : 'up') + ' ' +
          Math.abs(U.round(sleep.delta, 1)) + 'h',
        detail: 'Averaging ' + U.round(sleep.recent, 1) + 'h over the last fortnight against ' +
          U.round(sleep.prior, 1) + 'h before that.',
        route: '#/health', sample: sleep.sample
      }));
    }

    const energy = Health.average(state, 'energy', 14, ref);
    if (energy && energy.sample >= 7 && energy.value < 2.6) {
      out.push(make({
        id: 'health-low-energy', domain: 'health', severity: 'warn',
        title: 'Energy has been low',
        detail: 'Averaging ' + U.round(energy.value, 1) + '/5 across ' +
          U.plural(energy.sample, 'logged day') + '.',
        route: '#/health', sample: energy.sample
      }));
    }

    return out;
  }

  /* ------------------------------------------------------- cross-domain */
  /* The part no single-purpose tracker can do: hold two parts of a life
     side by side and see whether they move together. */

  function crossInsights(state, ref) {
    const out = [];

    // Sleep against energy. Both are recorded on the same check-in — the
    // entry for a day asks how you slept last night and how you feel today —
    // so these are already the same night and the morning after it.
    const se = Health.pairedDays(state, 'sleepHours', 'energy', 90, ref);
    if (se.n >= MIN_PAIRED) {
      const r = U.correlation(se.xs, se.ys, MIN_PAIRED);
      if (r !== null && r >= MIN_R) {
        const split = splitByMedian(se.xs, se.ys);
        if (split) {
          out.push(make({
            id: 'cross-sleep-energy', domain: 'cross', severity: 'info',
            title: 'Sleep and energy move together',
            detail: 'After your better nights (' + U.round(split.highX, 1) + 'h or more) energy averages ' +
              U.round(split.highY, 1) + '/5, against ' + U.round(split.lowY, 1) + '/5 after the shorter ones. ' +
              U.plural(se.n, 'day') + ' of data.',
            route: '#/health', sample: se.n
          }));
        }
      }
    }

    // Movement against same-day mood.
    const mv = Health.pairedDays(state, 'exerciseMins', 'mood', 90, ref);
    if (mv.n >= MIN_PAIRED) {
      const r = U.correlation(mv.xs, mv.ys, MIN_PAIRED);
      if (r !== null && r >= MIN_R) {
        const split = splitByThreshold(mv.xs, mv.ys, 1);
        if (split && split.lowN >= MIN_GROUP && split.highN >= MIN_GROUP) {
          out.push(make({
            id: 'cross-move-mood', domain: 'cross', severity: 'info',
            title: 'Mood sits higher on days you move',
            detail: 'Mood averages ' + U.round(split.highY, 1) + '/5 on days with movement logged (' +
              split.highN + ' days) and ' + U.round(split.lowY, 1) + '/5 without (' + split.lowN + ' days).',
            route: '#/health', sample: mv.n
          }));
        }
      }
    }

    // Habit adherence on well-slept days versus the rest.
    const hs = habitsVsSleep(state, ref);
    if (hs) {
      out.push(make({
        id: 'cross-sleep-habits', domain: 'cross', severity: 'info',
        title: 'Habits hold up better on rested days',
        detail: 'You complete ' + Math.round(hs.highPct) + '% of habits after ' +
          U.round(hs.threshold, 1) + 'h or more sleep, against ' + Math.round(hs.lowPct) +
          '% after less. ' + U.plural(hs.n, 'day') + ' compared.',
        route: '#/habits', sample: hs.n
      }));
    }

    // Task throughput against energy.
    const te = tasksVsEnergy(state, ref);
    if (te) {
      out.push(make({
        id: 'cross-energy-tasks', domain: 'cross', severity: 'info',
        title: 'You finish more on high-energy days',
        detail: U.round(te.highMean, 1) + ' tasks a day when energy is 4 or 5, against ' +
          U.round(te.lowMean, 1) + ' when it is 3 or below. ' + U.plural(te.n, 'logged day') + '.',
        route: '#/tasks', sample: te.n
      }));
    }

    // Journalling against mood.
    const jm = journalVsMood(state, ref);
    if (jm) {
      out.push(make({
        id: 'cross-journal-mood', domain: 'cross', severity: 'info',
        title: 'Mood runs higher on days you write',
        detail: 'Mood averages ' + U.round(jm.withMean, 1) + '/5 on days with a journal entry (' +
          jm.withN + ' days) against ' + U.round(jm.withoutMean, 1) + '/5 without (' + jm.withoutN + ').',
        route: '#/journal', sample: jm.withN + jm.withoutN
      }));
    }

    // Money against mood — the connection people feel but rarely measure.
    const sm = spendVsMood(state, ref);
    if (sm) {
      out.push(make({
        id: 'cross-spend-mood', domain: 'cross', severity: 'info',
        title: 'Lower-mood days cost more',
        detail: 'You spend ' + U.formatMoney(sm.lowMean) + ' on days you rate mood 2 or below, ' +
          'against ' + U.formatMoney(sm.highMean) + ' on days of 4 or more. ' +
          sm.lowN + ' low days, ' + sm.highN + ' high.',
        route: '#/money', sample: sm.lowN + sm.highN
      }));
    }

    return out;
  }

  /* ------------------------------------------------- comparison helpers */

  // x from day d, y from day d+1.
  function laggedPairs(state, fieldX, fieldY, days, ref) {
    const from = U.addDays(ref, -(days - 1));
    const xs = [], ys = [];
    U.dateRange(from, U.addDays(ref, -1)).forEach(function (d) {
      const a = state.checkins[d], b = state.checkins[U.addDays(d, 1)];
      if (!a || !b) return;
      const x = a[fieldX], y = b[fieldY];
      if (x === null || x === undefined || y === null || y === undefined) return;
      xs.push(x); ys.push(y);
    });
    return { xs: xs, ys: ys, n: xs.length };
  }

  function splitByMedian(xs, ys) {
    const med = U.median(xs);
    if (med === null) return null;
    const high = [], low = [], highX = [];
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] >= med) { high.push(ys[i]); highX.push(xs[i]); }
      else low.push(ys[i]);
    }
    if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null;
    return { highX: U.mean(highX), highY: U.mean(high), lowY: U.mean(low), highN: high.length, lowN: low.length };
  }

  function splitByThreshold(xs, ys, threshold) {
    const high = [], low = [];
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] >= threshold) high.push(ys[i]); else low.push(ys[i]);
    }
    if (!high.length || !low.length) return null;
    return { highY: U.mean(high), lowY: U.mean(low), highN: high.length, lowN: low.length };
  }

  function habitsVsSleep(state, ref) {
    const habits = Habits.activeHabits(state).filter(function (h) { return h.cadence === 'daily'; });
    if (!habits.length) return null;
    const from = U.addDays(ref, -89);
    const pairs = [];
    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      if (!c || c.sleepHours === null || c.sleepHours === undefined) return;
      let done = 0;
      habits.forEach(function (h) { if (Habits.isDone(state, h.id, d)) done++; });
      pairs.push({ sleep: c.sleepHours, pct: (done / habits.length) * 100 });
    });
    if (pairs.length < MIN_PAIRED) return null;

    const med = U.median(pairs.map(function (p) { return p.sleep; }));
    const high = pairs.filter(function (p) { return p.sleep >= med; });
    const low = pairs.filter(function (p) { return p.sleep < med; });
    if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null;

    const hp = U.mean(high.map(function (p) { return p.pct; }));
    const lp = U.mean(low.map(function (p) { return p.pct; }));
    if (hp - lp < 15) return null;
    return { highPct: hp, lowPct: lp, threshold: med, n: pairs.length };
  }

  function tasksVsEnergy(state, ref) {
    const from = U.addDays(ref, -89);
    const high = [], low = [];
    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      if (!c || c.energy === null || c.energy === undefined) return;
      const n = Tasks.completedIn(state, d, d).length;
      if (c.energy >= 4) high.push(n);
      else if (c.energy <= 3) low.push(n);
    });
    if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null;
    const hm = U.mean(high), lm = U.mean(low);
    if (hm - lm < 0.75) return null;
    return { highMean: hm, lowMean: lm, n: high.length + low.length };
  }

  function journalVsMood(state, ref) {
    const from = U.addDays(ref, -89);
    const withJ = [], withoutJ = [];
    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      if (!c || c.mood === null || c.mood === undefined) return;
      if (state.journal[d]) withJ.push(c.mood); else withoutJ.push(c.mood);
    });
    if (withJ.length < MIN_GROUP || withoutJ.length < MIN_GROUP) return null;
    const a = U.mean(withJ), b = U.mean(withoutJ);
    if (a - b < 0.4) return null;
    return { withMean: a, withoutMean: b, withN: withJ.length, withoutN: withoutJ.length };
  }

  function spendVsMood(state, ref) {
    const from = U.addDays(ref, -89);
    const low = [], high = [];
    const byDay = U.groupBy(state.money.transactions.filter(function (t) {
      return t.kind === 'expense';
    }), function (t) { return t.date; });

    U.dateRange(from, ref).forEach(function (d) {
      const c = state.checkins[d];
      if (!c || c.mood === null || c.mood === undefined) return;
      const spend = U.sum((byDay[d] || []).map(function (t) { return t.amountPence; }));
      if (c.mood <= 2) low.push(spend);
      else if (c.mood >= 4) high.push(spend);
    });
    if (low.length < MIN_GROUP || high.length < MIN_GROUP) return null;
    const lm = U.mean(low), hm = U.mean(high);
    if (lm <= hm * 1.3 || lm - hm < 500) return null;
    return { lowMean: lm, highMean: hm, lowN: low.length, highN: high.length };
  }

  /* ----------------------------------------------------------- assembly */

  function all(state, refISO) {
    const ref = refISO || U.today();
    const list = []
      .concat(moneyInsights(state, ref))
      .concat(workInsights(state, ref))
      .concat(habitInsights(state, ref))
      .concat(healthInsights(state, ref))
      .concat(crossInsights(state, ref));

    return list.sort(function (a, b) {
      const d = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return d !== 0 ? d : a.title.localeCompare(b.title);
    });
  }

  function top(state, n, refISO) {
    return all(state, refISO).slice(0, n == null ? 3 : n);
  }

  K.Insights = {
    MIN_PAIRED: MIN_PAIRED,
    MIN_GROUP: MIN_GROUP,
    all: all,
    top: top,
    moneyInsights: moneyInsights,
    workInsights: workInsights,
    habitInsights: habitInsights,
    healthInsights: healthInsights,
    crossInsights: crossInsights,
    laggedPairs: laggedPairs
  };
})(globalThis.Keel = globalThis.Keel || {});
