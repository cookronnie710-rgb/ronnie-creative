/* Keel — Money: cash, runway, what comes in and what goes out. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, M = K.Model, Mo = K.Money, Ch = K.Charts;

  K.Screens = K.Screens || {};

  K.Screens.money = {
    render: function (ctx) {
      return [
        headline(ctx),
        goalsCard(ctx),
        monthCard(ctx),
        streamsCard(ctx),
        recurringCard(ctx),
        transactionsCard(ctx)
      ];
    }
  };

  /* ------------------------------------------------------------- headline */

  function headline(ctx) {
    const st = ctx.state;
    const r = Mo.runway(st, ctx.today);
    const est = Mo.burnEstimate(st, ctx.today);

    return C.card({ class: 'money-headline' }, [
      h('div.cash-block', [
        h('button.cash-value', {
          type: 'button',
          'aria-label': 'Update cash balance',
          onclick: function () { cashEditor(ctx); }
        }, U.formatMoney(st.money.cashPence)),
        h('p.cash-label', st.money.cashUpdated
          ? 'Cash · updated ' + U.relativeDay(st.money.cashUpdated, ctx.today)
          : 'Tap to set your cash balance')
      ]),

      h('div.runway', [
        runwayLine(r, st),
        h('div.runway-basis', basisText(est))
      ]),

      C.statRow([
        C.stat({
          value: U.formatMoney(est.incomePence, { round: true }),
          label: 'In a month'
        }),
        C.stat({
          value: U.formatMoney(est.expensePence, { round: true }),
          label: 'Out a month'
        }),
        C.stat({
          value: U.formatMoney(est.netPence, { round: true, plus: true }),
          label: 'Net',
          tone: est.netPence >= 0 ? 'good' : 'critical'
        })
      ])
    ]);
  }

  function runwayLine(r, st) {
    if (r.basis === 'none') {
      return h('p.runway-text', 'Add a few regular items below and Keel will work out how long your money lasts.');
    }
    if (r.status === 'growing') {
      return h('p.runway-text.tone-good', 'Your cash is growing, not shrinking.');
    }
    const tone = r.status === 'critical' ? 'critical' : r.status === 'low' ? 'warning' : 'good';
    const cap = Math.min(r.months, 24);
    return h('div.runway-line', [
      h('div.runway-bar', h('div.runway-fill.tone-' + tone, {
        style: { width: U.clamp((cap / 12) * 100, 4, 100) + '%' }
      })),
      h('p.runway-text.tone-' + tone, [
        h('strong', r.months + (r.months === 1 ? ' month' : ' months')),
        ' of runway · empty around ' + U.formatDate(r.zeroDate, 'medium')
      ])
    ]);
  }

  function basisText(est) {
    if (est.basis === 'actual') {
      return 'Based on what you actually logged over ' +
        U.plural(est.monthsSampled, 'month') + '.';
    }
    if (est.basis === 'planned') {
      return 'Based on your regular items. Log some transactions and this ' +
        'switches to your real numbers.';
    }
    return 'Nothing to go on yet.';
  }

  function cashEditor(ctx) {
    K.Forms.editor({
      title: 'Cash balance',
      initial: { amount: K.Forms.poundsString(ctx.state.money.cashPence) },
      validate: function (d) {
        return U.parseMoney(d.amount) === null ? 'Enter an amount.' : null;
      },
      fields: function (d, set) {
        return [
          C.field({
            label: 'Everything you can spend today', prefix: '£',
            inputMode: 'decimal', value: d.amount, focusKey: 'cash',
            hint: 'Current accounts plus easy-access savings. Not pension or stock.',
            onInput: function (e) { set('amount', e.target.value); }
          })
        ];
      },
      onSave: function (d) { ctx.actions.setCash(U.parseMoney(d.amount) || 0); }
    });
  }

  /* ---------------------------------------------------------------- goals */

  function goalsCard(ctx) {
    const goals = ctx.state.money.goals.filter(function (g) { return !g.archived; });
    const surplus = Math.max(0, Mo.burnEstimate(ctx.state, ctx.today).netPence);

    return C.card({
      title: 'Goals',
      action: C.button('Add', {
        size: 'sm', onClick: function () { K.Forms.goalEditor(ctx, null); }
      })
    }, goals.length ? h('div.list', goals.map(function (g) {
      const p = Mo.goalProjection(g, surplus, ctx.today);
      return h('div.goal', [
        h('button.goal-head', {
          type: 'button',
          onclick: function () { K.Forms.goalEditor(ctx, g); }
        }, [
          h('div.goal-name', g.label),
          h('div.goal-amounts', [
            h('strong', U.formatMoney(g.savedPence, { round: true })),
            h('span', ' of ' + U.formatMoney(g.targetPence, { round: true }))
          ])
        ]),
        C.progress(p.progressPct / 100, p.onTrack === false ? 'warning' : 'good'),
        h('div.goal-foot', [
          h('span', goalNote(g, p, ctx)),
          C.button('+ £10', {
            size: 'sm', variant: 'ghost',
            onClick: function () { ctx.actions.contributeToGoal(g.id, 1000); }
          })
        ])
      ]);
    })) : C.empty('No goals yet. Even a small one gives the surplus somewhere to go.'));
  }

  function goalNote(g, p, ctx) {
    if (p.remainingPence === 0) return 'Done.';
    if (g.targetDate && p.requiredMonthlyPence) {
      return (p.onTrack ? 'On track · ' : 'Needs ') +
        U.formatMoney(p.requiredMonthlyPence, { round: true }) + '/mo to hit ' +
        U.formatDate(g.targetDate, 'short');
    }
    if (p.projectedDate) {
      return U.formatMoney(p.monthlyPence, { round: true }) + '/mo → ' +
        U.formatDate(p.projectedDate, 'short');
    }
    return U.formatMoney(p.remainingPence, { round: true }) + ' to go';
  }

  /* ---------------------------------------------------------- this month */

  function monthCard(ctx) {
    const history = Mo.monthHistory(ctx.state, 6, ctx.today);
    const current = history[history.length - 1];
    const cats = U.sortBy(Object.keys(current.byCategory).map(function (c) {
      return { label: U.humanise(c), value: current.byCategory[c],
        display: U.formatMoney(current.byCategory[c], { round: true }) };
    }), function (c) { return c.value; }, 'desc').slice(0, 6);

    const hasAny = history.some(function (m) { return m.count > 0; });

    return C.card({
      title: 'Month by month',
      subtitle: hasAny ? 'What you kept, six months back' : null
    }, hasAny ? [
      Ch.netBars(history),
      cats.length ? [
        h('h3.subhead', 'Where it went this month'),
        Ch.rankedBars(cats)
      ] : null
    ] : C.empty('Log a few transactions and the shape of your months shows up here.'));
  }

  /* -------------------------------------------------------------- streams */

  function streamsCard(ctx) {
    const cov = Mo.streamCoverage(ctx.state, ctx.today);
    if (!cov.months || !cov.streams.length) return null;

    return C.card({
      title: 'Where the money comes from',
      subtitle: 'Monthly average over ' + U.plural(cov.months, 'month')
    }, h('div.list', cov.streams.map(function (s) {
      return C.row({
        title: s.label,
        subtitle: s.coveragePct !== null
          ? 'Covers ' + s.coveragePct + '% of your outgoings' : null,
        trailing: h('strong.row-amount', U.formatMoney(s.monthlyPence, { round: true }))
      });
    })));
  }

  /* ------------------------------------------------------------ recurring */

  function recurringCard(ctx) {
    const items = ctx.state.money.recurring;
    const planned = Mo.plannedMonthly(ctx.state);
    const sorted = U.sortBy(items, function (r) { return -Mo.monthlyAmount(r); });

    return C.card({
      title: 'Regular money',
      subtitle: items.length
        ? U.formatMoney(planned.incomePence, { round: true }) + ' in · ' +
          U.formatMoney(planned.expensePence, { round: true }) + ' out, every month'
        : null,
      action: C.button('Add', {
        size: 'sm', onClick: function () { K.Forms.recurringEditor(ctx, null); }
      })
    }, sorted.length ? h('div.list', sorted.map(function (r) {
      const monthly = Math.round(Mo.monthlyAmount(r));
      return C.row({
        class: r.active ? null : 'is-muted',
        title: r.label,
        subtitle: (M.statusMeta(M.CADENCES, r.cadence) || {}).label +
          (r.cadence !== 'monthly' ? ' · ' + U.formatMoney(monthly, { round: true }) + '/mo' : '') +
          (r.dueDay ? ' · ' + ordinal(r.dueDay) : ''),
        trailing: h('strong.row-amount' + (r.kind === 'income' ? '.tone-good' : ''),
          (r.kind === 'income' ? '+' : '−') + U.formatMoney(r.amountPence, { round: true })),
        onClick: function () { K.Forms.recurringEditor(ctx, r); }
      });
    })) : C.empty('Add your rent, bills and any regular income. This is what makes runway real.'));
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* --------------------------------------------------------- transactions */

  function transactionsCard(ctx) {
    const all = U.sortBy(ctx.state.money.transactions, function (t) { return t.date; }, 'desc');
    const recent = all.slice(0, 30);
    const byDay = U.groupBy(recent, function (t) { return t.date; });
    const days = Object.keys(byDay).sort().reverse();

    return C.card({
      title: 'Recent',
      subtitle: all.length > 30 ? 'Latest 30 of ' + all.length : null,
      action: C.button('Add', {
        size: 'sm', onClick: function () { K.Forms.transactionEditor(ctx, null); }
      })
    }, days.length ? days.map(function (d) {
      const items = byDay[d];
      const net = U.sum(items.map(function (t) {
        return t.kind === 'income' ? t.amountPence : -t.amountPence;
      }));
      return h('div.txn-day', [
        h('div.txn-dayhead', [
          h('span', U.formatDate(d, 'medium')),
          h('span.txn-daynet', U.formatMoney(net, { plus: true, round: true }))
        ]),
        h('div.list', items.map(function (t) {
          return C.row({
            title: t.label,
            subtitle: t.kind === 'income'
              ? K.Export.streamLabel(t.stream) : U.humanise(t.category),
            trailing: h('strong.row-amount' + (t.kind === 'income' ? '.tone-good' : ''),
              (t.kind === 'income' ? '+' : '−') + U.formatMoney(t.amountPence)),
            onClick: function () { K.Forms.transactionEditor(ctx, t); }
          });
        }))
      ]);
    }) : C.empty('Nothing logged yet. Two taps on Today adds one.'));
  }
})(globalThis.Keel = globalThis.Keel || {});
