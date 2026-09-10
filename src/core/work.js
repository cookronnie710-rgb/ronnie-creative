/* Keel — work: job applications and freelance gigs. Pure logic. */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model;

  function appMeta(status) { return M.statusMeta(M.APP_STATUSES, status) || M.APP_STATUSES[1]; }
  function gigMeta(status) { return M.statusMeta(M.GIG_STATUSES, status) || M.GIG_STATUSES[0]; }

  function openApplications(state) {
    return state.applications.filter(function (a) { return appMeta(a.status).open; });
  }

  function closedApplications(state) {
    return state.applications.filter(function (a) { return !appMeta(a.status).open; });
  }

  function openGigs(state) {
    return state.gigs.filter(function (g) { return gigMeta(g.status).open; });
  }

  /* ------------------------------------------------------------- follow-up */

  // Silence is the default outcome of a job application, so the app has to
  // be the thing that remembers. An application counts as gone quiet when
  // nothing has happened for followUpDays and no next action is scheduled.
  function needsFollowUp(state, refISO) {
    const ref = refISO || U.today();
    const limit = state.settings.followUpDays;
    return openApplications(state).filter(function (a) {
      if (a.status === 'lead') return false;
      if (a.nextActionDate && U.daysBetween(ref, a.nextActionDate) >= 0) return false;
      const since = a.lastContact || a.appliedDate;
      const days = U.daysBetween(since, ref);
      return days !== null && days >= limit;
    }).map(function (a) {
      const since = a.lastContact || a.appliedDate;
      return { application: a, silentDays: U.daysBetween(since, ref), since: since };
    }).sort(function (x, y) { return y.silentDays - x.silentDays; });
  }

  // Scheduled next actions that are due or overdue, across both pipelines.
  function dueActions(state, refISO) {
    const ref = refISO || U.today();
    const out = [];
    openApplications(state).forEach(function (a) {
      if (!a.nextActionDate) return;
      const days = U.daysBetween(ref, a.nextActionDate);
      if (days !== null && days <= 0) {
        out.push({
          kind: 'application', id: a.id,
          title: a.nextAction || 'Follow up',
          subtitle: a.company + (a.role ? ' · ' + a.role : ''),
          date: a.nextActionDate, overdueDays: Math.max(0, -days)
        });
      }
    });
    openGigs(state).forEach(function (g) {
      if (!g.dueDate) return;
      const days = U.daysBetween(ref, g.dueDate);
      if (days !== null && days <= 0 && g.status !== 'delivered') {
        out.push({
          kind: 'gig', id: g.id,
          title: g.title || 'Deliver work',
          subtitle: g.client,
          date: g.dueDate, overdueDays: Math.max(0, -days)
        });
      }
    });
    return U.sortBy(out, function (o) { return o.date; });
  }

  /* -------------------------------------------------------------- pipeline */

  // Expected value, each item discounted by how far it has actually got.
  // A shelf of "applied" roles is not a salary, and this stops it looking
  // like one.
  function pipelineValue(state) {
    let appExpected = 0, appTotal = 0;
    openApplications(state).forEach(function (a) {
      appExpected += a.salaryPence * appMeta(a.status).weight;
      appTotal += a.salaryPence;
    });

    let gigExpected = 0, gigTotal = 0;
    openGigs(state).forEach(function (g) {
      gigExpected += g.quotedPence * gigMeta(g.status).weight;
      gigTotal += g.quotedPence;
    });

    return {
      applications: {
        count: openApplications(state).length,
        expectedPence: Math.round(appExpected),
        totalPence: appTotal
      },
      gigs: {
        count: openGigs(state).length,
        expectedPence: Math.round(gigExpected),
        totalPence: gigTotal
      }
    };
  }

  function funnel(state) {
    const counts = {};
    M.APP_STATUSES.forEach(function (s) { counts[s.id] = 0; });
    state.applications.forEach(function (a) {
      if (counts[a.status] === undefined) counts[a.status] = 0;
      counts[a.status]++;
    });
    return M.APP_STATUSES.map(function (s) {
      return { id: s.id, label: s.label, count: counts[s.id] || 0, open: s.open };
    });
  }

  // Share of applications that got any response at all. Only counts
  // applications old enough to have plausibly heard back.
  function responseRate(state, refISO) {
    const ref = refISO || U.today();
    const limit = state.settings.followUpDays;
    const mature = state.applications.filter(function (a) {
      if (a.status === 'lead') return false;
      const d = U.daysBetween(a.appliedDate, ref);
      return d !== null && d >= limit;
    });
    if (!mature.length) return { sample: 0, pct: null, responded: 0 };
    const responded = mature.filter(function (a) {
      return ['screening', 'interview', 'final', 'offer', 'accepted', 'rejected'].indexOf(a.status) >= 0
        || !!a.lastContact;
    }).length;
    return { sample: mature.length, responded: responded, pct: (responded / mature.length) * 100 };
  }

  function applicationsInRange(state, fromISO, toISO) {
    return state.applications.filter(function (a) {
      return U.daysBetween(fromISO, a.appliedDate) >= 0 && U.daysBetween(a.appliedDate, toISO) >= 0;
    });
  }

  /* ------------------------------------------------------------------ gigs */

  // Work delivered but not yet paid for. The number freelancers most often
  // discover too late.
  function unpaid(state) {
    const items = state.gigs.filter(function (g) {
      return (g.status === 'delivered' || g.status === 'in_progress')
        && g.quotedPence > g.paidPence;
    }).map(function (g) {
      return { gig: g, owedPence: g.quotedPence - g.paidPence };
    });
    return {
      items: U.sortBy(items, function (i) { return i.owedPence; }, 'desc'),
      totalPence: U.sum(items.map(function (i) { return i.owedPence; }))
    };
  }

  function overdueGigs(state, refISO) {
    const ref = refISO || U.today();
    return openGigs(state).filter(function (g) {
      if (!g.dueDate || g.status === 'delivered') return false;
      const d = U.daysBetween(ref, g.dueDate);
      return d !== null && d < 0;
    }).map(function (g) {
      return { gig: g, overdueDays: Math.max(0, -U.daysBetween(ref, g.dueDate)) };
    });
  }

  // Realised hourly rate on finished work — the honest answer to
  // "was that job worth it?"
  function effectiveRate(state) {
    const done = state.gigs.filter(function (g) {
      return g.status === 'paid' && g.hoursLogged > 0;
    });
    if (!done.length) return null;
    const pence = U.sum(done.map(function (g) { return g.paidPence || g.quotedPence; }));
    const hours = U.sum(done.map(function (g) { return g.hoursLogged; }));
    if (!hours) return null;
    return {
      pencePerHour: Math.round(pence / hours),
      jobs: done.length,
      hours: U.round(hours, 1)
    };
  }

  // Quoted vs actual hours: are estimates systematically optimistic?
  function estimateAccuracy(state) {
    const done = state.gigs.filter(function (g) {
      return g.hoursEstimate > 0 && g.hoursLogged > 0 &&
        (g.status === 'paid' || g.status === 'delivered');
    });
    if (done.length < 3) return null;
    const ratios = done.map(function (g) { return g.hoursLogged / g.hoursEstimate; });
    return { jobs: done.length, medianRatio: U.round(U.median(ratios), 2) };
  }

  K.Work = {
    appMeta: appMeta,
    gigMeta: gigMeta,
    openApplications: openApplications,
    closedApplications: closedApplications,
    openGigs: openGigs,
    needsFollowUp: needsFollowUp,
    dueActions: dueActions,
    pipelineValue: pipelineValue,
    funnel: funnel,
    responseRate: responseRate,
    applicationsInRange: applicationsInRange,
    unpaid: unpaid,
    overdueGigs: overdueGigs,
    effectiveRate: effectiveRate,
    estimateAccuracy: estimateAccuracy
  };
})(globalThis.Keel = globalThis.Keel || {});
