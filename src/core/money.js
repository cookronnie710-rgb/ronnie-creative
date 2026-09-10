/* Keel — money engine: cashflow, burn, runway, goals. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model;

  /* ------------------------------------------------------ recurring plan */

  // Every cadence normalised to a monthly figure: annual/12, weekly*52/12,
  // and so on. Fortnightly is 26/yr, not 24 — that gap is a month of rent
  // over a working life, so it is worth getting right.
  function monthlyAmount(item) {
    const perYear = M.cadencePerYear(item.cadence);
    return (item.amountPence * perYear) / 12;
  }

  function plannedMonthly(state) {
    // An item with no amount on it is a placeholder, not a plan. Counting
    // those would let a fresh install claim it knows your finances.
    const active = state.money.recurring.filter(function (r) {
      return r.active && r.amountPence > 0;
    });
    let income = 0, expense = 0;
    active.forEach(function (r) {
      const m = monthlyAmount(r);
      if (r.kind === 'income') income += m; else expense += m;
    });
    return {
      incomePence: Math.round(income),
      expensePence: Math.round(expense),
      netPence: Math.round(income - expense),
      count: active.length
    };
  }

  /* ------------------------------------------------------- actual months */

  function transactionsIn(state, fromISO, toISO) {
    return state.money.transactions.filter(function (t) {
      return U.daysBetween(fromISO, t.date) >= 0 && U.daysBetween(t.date, toISO) >= 0;
    });
  }

  function summarise(txns) {
    let income = 0, expense = 0;
    const byCategory = {}, byStream = {};
    txns.forEach(function (t) {
      if (t.kind === 'income') {
        income += t.amountPence;
        const k = t.stream || 'other';
        byStream[k] = (byStream[k] || 0) + t.amountPence;
      } else {
        expense += t.amountPence;
        const c = t.category || 'other';
        byCategory[c] = (byCategory[c] || 0) + t.amountPence;
      }
    });
    return {
      incomePence: income,
      expensePence: expense,
      netPence: income - expense,
      byCategory: byCategory,
      byStream: byStream,
      count: txns.length
    };
  }

  function monthSummary(state, mKey) {
    const first = mKey + '-01';
    if (!U.isISODate(first)) return summarise([]);
    const last = U.endOfMonth(first);
    const s = summarise(transactionsIn(state, first, last));
    s.monthKey = mKey;
    return s;
  }

  // The N complete calendar months before the current one, newest first.
  function recentMonthKeys(n, refISO) {
    const ref = refISO || U.today();
    const out = [];
    for (let i = 1; i <= n; i++) out.push(U.monthKey(U.addMonths(U.startOfMonth(ref), -i)));
    return out;
  }

  /* ------------------------------------------------------- burn estimate */

  // Which basis to trust: logged transactions if there is real history,
  // otherwise the recurring plan. Reporting the basis matters more than
  // picking cleverly — a runway figure with an unstated source is noise.
  function burnEstimate(state, refISO) {
    const ref = refISO || U.today();
    const planned = plannedMonthly(state);
    const keys = recentMonthKeys(3, ref);
    const months = keys.map(function (k) { return monthSummary(state, k); });
    const withData = months.filter(function (m) { return m.count > 0; });

    if (withData.length >= 2) {
      const net = Math.round(U.mean(withData.map(function (m) { return m.netPence; })));
      const inc = Math.round(U.mean(withData.map(function (m) { return m.incomePence; })));
      const exp = Math.round(U.mean(withData.map(function (m) { return m.expensePence; })));
      return {
        basis: 'actual',
        monthsSampled: withData.length,
        incomePence: inc,
        expensePence: exp,
        netPence: net,
        plannedNetPence: planned.netPence,
        confidence: withData.length >= 3 ? 'good' : 'fair'
      };
    }

    return {
      basis: planned.count ? 'planned' : 'none',
      monthsSampled: withData.length,
      incomePence: planned.incomePence,
      expensePence: planned.expensePence,
      netPence: planned.netPence,
      plannedNetPence: planned.netPence,
      confidence: planned.count ? 'low' : 'none'
    };
  }

  /* -------------------------------------------------------------- runway */

  // months = null means "not losing money" (or nothing to go on), which is
  // very different from zero and must never be rendered as 0.
  function runway(state, refISO) {
    const ref = refISO || U.today();
    const est = burnEstimate(state, ref);
    const cash = state.money.cashPence;
    const out = {
      cashPence: cash,
      netPence: est.netPence,
      basis: est.basis,
      confidence: est.confidence,
      months: null,
      zeroDate: null,
      status: 'unknown'
    };

    if (est.basis === 'none') return out;

    if (est.netPence >= 0) {
      out.status = 'growing';
      return out;
    }

    const burn = -est.netPence;
    if (cash <= 0) {
      out.months = 0;
      out.zeroDate = ref;
      out.status = 'critical';
      return out;
    }

    const months = cash / burn;
    out.months = U.round(months, 1);
    out.zeroDate = U.addDays(ref, Math.round(months * 30.44));
    const warn = state.settings.runwayWarnMonths;
    out.status = months < 1 ? 'critical' : (months < warn ? 'low' : 'ok');
    return out;
  }

  /* --------------------------------------------------------------- goals */

  // Contributions are whatever monthly surplus exists, unless the goal
  // declares its own monthly amount.
  function goalProjection(goal, monthlySurplusPence, refISO) {
    const ref = refISO || U.today();
    const remaining = Math.max(0, goal.targetPence - goal.savedPence);
    const monthly = goal.monthlyPence > 0
      ? goal.monthlyPence
      : Math.max(0, monthlySurplusPence || 0);

    const out = {
      remainingPence: remaining,
      progressPct: goal.targetPence > 0
        ? U.clamp((goal.savedPence / goal.targetPence) * 100, 0, 100) : 0,
      monthlyPence: monthly,
      monthsToTarget: null,
      projectedDate: null,
      requiredMonthlyPence: null,
      onTrack: null
    };

    if (remaining === 0) {
      out.monthsToTarget = 0;
      out.projectedDate = ref;
      out.onTrack = true;
      return out;
    }

    if (monthly > 0) {
      const months = remaining / monthly;
      out.monthsToTarget = U.round(months, 1);
      out.projectedDate = U.addMonths(ref, Math.ceil(months));
    }

    if (goal.targetDate) {
      const days = U.daysBetween(ref, goal.targetDate);
      const monthsLeft = days === null ? null : days / 30.44;
      if (monthsLeft !== null && monthsLeft > 0) {
        out.requiredMonthlyPence = Math.ceil(remaining / monthsLeft);
        out.onTrack = monthly >= out.requiredMonthlyPence;
      } else {
        out.requiredMonthlyPence = remaining;
        out.onTrack = false;
      }
    }

    return out;
  }

  /* ------------------------------------------------------------- streams */

  // What share of monthly outgoings each income stream actually covers.
  function streamCoverage(state, refISO) {
    const ref = refISO || U.today();
    const keys = recentMonthKeys(3, ref);
    const months = keys.map(function (k) { return monthSummary(state, k); })
      .filter(function (m) { return m.count > 0; });

    if (!months.length) return { months: 0, expensePence: 0, streams: [] };

    const expense = Math.round(U.mean(months.map(function (m) { return m.expensePence; })));
    const totals = {};
    months.forEach(function (m) {
      Object.keys(m.byStream).forEach(function (s) {
        totals[s] = (totals[s] || 0) + m.byStream[s];
      });
    });

    const streams = Object.keys(totals).map(function (s) {
      const monthly = Math.round(totals[s] / months.length);
      return {
        id: s,
        label: (M.statusMeta(M.STREAMS, s) || {}).label || U.humanise(s),
        monthlyPence: monthly,
        coveragePct: expense > 0 ? U.round((monthly / expense) * 100, 0) : null
      };
    });

    return {
      months: months.length,
      expensePence: expense,
      streams: U.sortBy(streams, function (s) { return s.monthlyPence; }, 'desc')
    };
  }

  /* ------------------------------------------------------- month history */

  function monthHistory(state, n, refISO) {
    const ref = refISO || U.today();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const k = U.monthKey(U.addMonths(U.startOfMonth(ref), -i));
      out.push(monthSummary(state, k));
    }
    return out;
  }

  /* --------------------------------------------------- upcoming outgoings */

  // Next occurrence of each active recurring expense, for the Today screen.
  function upcomingRecurring(state, withinDays, refISO) {
    const ref = refISO || U.today();
    const horizon = withinDays == null ? 14 : withinDays;
    const out = [];
    state.money.recurring.forEach(function (r) {
      if (!r.active || !r.dueDay) return;
      const next = nextDueDate(r.dueDay, ref);
      const days = U.daysBetween(ref, next);
      if (days !== null && days <= horizon) {
        out.push({ item: r, date: next, inDays: days });
      }
    });
    return U.sortBy(out, function (o) { return o.date; });
  }

  function nextDueDate(dueDay, refISO) {
    const d = U.fromISODate(refISO);
    if (!d) return null;
    const day = U.clamp(Math.round(dueDay), 1, 31);
    const thisMonthLast = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const candidate = new Date(d.getFullYear(), d.getMonth(), Math.min(day, thisMonthLast));
    if (U.daysBetween(refISO, U.toISODate(candidate)) >= 0) return U.toISODate(candidate);
    const nextLast = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    return U.toISODate(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(day, nextLast)));
  }

  K.Money = {
    monthlyAmount: monthlyAmount,
    plannedMonthly: plannedMonthly,
    transactionsIn: transactionsIn,
    summarise: summarise,
    monthSummary: monthSummary,
    recentMonthKeys: recentMonthKeys,
    burnEstimate: burnEstimate,
    runway: runway,
    goalProjection: goalProjection,
    streamCoverage: streamCoverage,
    monthHistory: monthHistory,
    upcomingRecurring: upcomingRecurring,
    nextDueDate: nextDueDate
  };
})(globalThis.Keel = globalThis.Keel || {});
