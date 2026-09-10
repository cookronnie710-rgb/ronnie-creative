/* Keel — Review: the weekly look back across every domain at once. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, R = K.Review, Ch = K.Charts;

  K.Screens = K.Screens || {};

  const SCORE_LABELS = {
    habits: 'Habits',
    tasks: 'Tasks',
    money: 'Money',
    health: 'Body',
    work: 'Work'
  };

  K.Screens.review = {
    render: function (ctx) {
      const st = ctx.state;
      const weeks = R.weeksWithData(st, 12, ctx.today);
      const selected = ctx.param && U.isISODate(ctx.param)
        ? ctx.param
        : R.reviewWeekStart(st, ctx.today);
      const d = R.fullDigest(st, selected, ctx.today);

      return [
        weekPicker(ctx, weeks, selected),
        headline(ctx, d),
        insightsCard(ctx, d),
        domainCards(ctx, d),
        writeUp(ctx, d)
      ];
    }
  };

  /* ----------------------------------------------------------- week picker */

  function weekPicker(ctx, weeks, selected) {
    return h('div.week-picker', { role: 'tablist', 'aria-label': 'Week' },
      weeks.slice(0, 8).map(function (w) {
        const active = w.start === selected;
        return h('button.week-chip' + (active ? '.is-active' : ''), {
          type: 'button', role: 'tab', 'aria-selected': active ? 'true' : 'false',
          onclick: function () { ctx.go('#/review/' + w.start); }
        }, [
          h('span.week-chip-label', U.formatDate(w.start, 'short')),
          h('span.week-chip-key', w.key.slice(5))
        ]);
      }));
  }

  /* -------------------------------------------------------------- headline */

  function headline(ctx, d) {
    const s = d.scores;
    return C.card({
      title: 'Week ' + d.period.key.slice(5),
      subtitle: d.period.label + (d.period.complete ? '' : ' · still in progress')
    }, [
      h('div.review-head', [
        s.overall === null
          ? h('div.gauge-empty', '—')
          : Ch.gauge(s.overall, { label: 'Week score' }),
        h('div.review-head-text', [
          h('p.review-verdict', verdict(s)),
          s.domainsScored
            ? h('p.review-scored',
                'Scored across ' + U.plural(s.domainsScored, 'area') +
                '. Areas you did not log are left out rather than counted as zero.')
            : null
        ])
      ]),
      s.overall !== null ? Ch.scoreBars(s, SCORE_LABELS) : null
    ]);
  }

  function verdict(s) {
    if (s.overall === null) return 'Nothing logged for this week yet.';
    if (s.overall >= 80) return 'A strong week.';
    if (s.overall >= 60) return 'A decent week.';
    if (s.overall >= 40) return 'A mixed week.';
    return 'A hard week. Worth asking what got in the way.';
  }

  /* -------------------------------------------------------------- insights */

  function insightsCard(ctx, d) {
    if (!d.insights.length) return null;
    return C.card({ title: 'Worth noticing' },
      h('div.list', d.insights.map(function (i) {
        return h('button.insight.tone-' + i.severity, {
          type: 'button',
          onclick: function () { if (i.route) ctx.go(i.route); }
        }, [
          h('span.insight-mark', { 'aria-hidden': 'true' },
            i.severity === 'urgent' ? '!' : i.severity === 'warn' ? '▲'
              : i.severity === 'good' ? '✓' : 'i'),
          h('div.insight-body', [
            h('div.insight-title', i.title),
            h('div.insight-detail', i.detail)
          ])
        ]);
      })));
  }

  /* --------------------------------------------------------- domain cards */

  function domainCards(ctx, d) {
    return [
      C.card({ title: 'Habits', subtitle: d.habits.count
        ? d.habits.done + ' of ' + d.habits.target +
          (d.habits.pct === null ? '' : ' · ' + Math.round(d.habits.pct) + '%')
        : null },
        d.habits.count
          ? h('div.list', d.habits.perHabit.map(function (p) {
              return C.row({
                leading: h('span.habit-emoji', p.habit.emoji),
                title: p.habit.name,
                subtitle: p.streak ? p.streak + ' running' : null,
                trailing: h('div.review-count' + (p.met ? '.is-met' : ''),
                  p.done + '/' + p.target)
              });
            }))
          : C.empty('No habits set up.')),

      C.card({ title: 'Tasks', subtitle: d.tasks.completed + ' finished' }, [
        C.statRow([
          C.stat({ value: String(d.tasks.completed), label: 'Done' }),
          C.stat({
            value: (d.tasks.delta >= 0 ? '+' : '') + d.tasks.delta,
            label: 'vs last week',
            tone: d.tasks.delta >= 0 ? 'good' : 'warning'
          }),
          C.stat({
            value: String(d.tasks.overdueNow), label: 'Overdue now',
            tone: d.tasks.overdueNow ? 'critical' : null
          })
        ]),
        d.tasks.completedList.length
          ? h('details.review-details', [
              h('summary', 'What got done'),
              h('div.list', d.tasks.completedList.slice(0, 25).map(function (t) {
                return C.row({ title: t.title, subtitle: U.formatDate(t.doneDate, 'short') });
              }))
            ])
          : null
      ]),

      C.card({ title: 'Money', subtitle: d.money.count
        ? U.plural(d.money.count, 'transaction') : null },
        d.money.count ? [
          C.statRow([
            C.stat({ value: U.formatMoney(d.money.incomePence, { round: true }), label: 'In' }),
            C.stat({ value: U.formatMoney(d.money.expensePence, { round: true }), label: 'Out' }),
            C.stat({
              value: U.formatMoney(d.money.netPence, { round: true, plus: true }),
              label: 'Net',
              tone: d.money.netPence >= 0 ? 'good' : 'critical'
            })
          ]),
          d.money.topCategories.length
            ? Ch.rankedBars(d.money.topCategories.map(function (c) {
                return {
                  label: U.humanise(c.category), value: c.pence,
                  display: U.formatMoney(c.pence, { round: true })
                };
              }))
            : null
        ] : C.empty('Nothing logged this week.')),

      C.card({ title: 'Work' }, [
        C.statRow([
          C.stat({ value: String(d.work.applicationsSent), label: 'Applied' }),
          C.stat({ value: String(d.work.applicationsMoved), label: 'Moved stage' }),
          C.stat({ value: String(d.work.gigsPaid), label: 'Jobs paid' })
        ]),
        d.work.followUps
          ? h('p.card-note.tone-warning',
              U.plural(d.work.followUps, 'application') + ' still waiting on a nudge.')
          : null,
        d.work.unpaidPence
          ? h('p.card-note.tone-warning',
              U.formatMoney(d.work.unpaidPence) + ' owed to you.')
          : null
      ]),

      C.card({ title: 'Body', subtitle: d.health.loggedDays + ' of ' +
        d.health.possibleDays + ' days logged' },
        d.health.loggedDays ? C.statRow([
          C.stat({
            value: d.health.sleep ? U.round(d.health.sleep.value, 1) : '—',
            unit: d.health.sleep ? 'h' : '', label: 'Sleep'
          }),
          C.stat({
            value: d.health.energy ? U.round(d.health.energy.value, 1) : '—',
            unit: d.health.energy ? '/5' : '', label: 'Energy'
          }),
          C.stat({
            value: d.health.mood ? U.round(d.health.mood.value, 1) : '—',
            unit: d.health.mood ? '/5' : '', label: 'Mood'
          }),
          C.stat({ value: String(d.health.moveDays), label: 'Days moved' })
        ]) : C.empty('No check-ins this week.')),

      d.journal.wins.length ? C.card({ title: 'Wins' },
        h('div.list', d.journal.wins.map(function (w) {
          return C.row({ title: w.text, subtitle: U.formatDate(w.date, 'short') });
        }))) : null,

      d.journal.lessons.length ? C.card({ title: 'Lessons' },
        h('div.list', d.journal.lessons.map(function (l) {
          return C.row({ title: l.text, subtitle: U.formatDate(l.date, 'short') });
        }))) : null
    ];
  }

  /* --------------------------------------------------------------- write-up */

  function writeUp(ctx, d) {
    const key = d.period.key;
    const saved = R.savedReview(ctx.state, key) || {};

    return C.card({
      title: 'Your take',
      subtitle: 'The numbers cannot tell you why. This part can.'
    }, [
      C.field({
        label: 'What went well', type: 'textarea', rows: 3,
        value: saved.wins || '', focusKey: 'review-wins-' + key,
        onInput: function (e) { ctx.actions.saveReview(key, { wins: e.target.value }); }
      }),
      C.field({
        label: 'What to do differently', type: 'textarea', rows: 3,
        value: saved.improve || '', focusKey: 'review-improve-' + key,
        onInput: function (e) { ctx.actions.saveReview(key, { improve: e.target.value }); }
      }),
      C.field({
        label: 'One thing for next week', type: 'textarea', rows: 2,
        value: saved.nextWeek || '', focusKey: 'review-next-' + key,
        placeholder: 'Something specific enough to know whether it happened.',
        onInput: function (e) { ctx.actions.saveReview(key, { nextWeek: e.target.value }); }
      }),
      h('div.review-actions', [
        C.button('Copy this week as Markdown', {
          variant: 'ghost',
          onClick: function () {
            const md = K.Export.weeklyNote(ctx.state, d.period.start);
            copyText(md, 'Week copied — paste it into Obsidian');
          }
        })
      ])
    ]);
  }

  function copyText(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        C.toast(message);
      }, function () { fallbackCopy(text, message); });
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    const ta = h('textarea', {
      value: text,
      style: { position: 'fixed', top: '-1000px', opacity: '0' }
    });
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    C.toast(ok ? message : 'Could not copy automatically', { tone: ok ? null : 'warning' });
  }

  K.Screens.review.copyText = copyText;
})(globalThis.Keel = globalThis.Keel || {});
