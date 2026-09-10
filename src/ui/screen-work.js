/* Keel — Work: job applications and freelance jobs in one pipeline. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, M = K.Model, W = K.Work;

  K.Screens = K.Screens || {};

  K.Screens.work = {
    render: function (ctx) {
      const tab = ctx.param || 'jobs';
      return [
        overview(ctx),
        h('div.segmented', { role: 'tablist' }, [
          segButton('Applications', 'jobs', tab, ctx),
          segButton('Freelance', 'gigs', tab, ctx)
        ]),
        tab === 'gigs' ? gigsPane(ctx) : applicationsPane(ctx)
      ];
    }
  };

  function segButton(label, id, active, ctx) {
    return h('button.seg' + (active === id ? '.is-active' : ''), {
      type: 'button', role: 'tab', 'aria-selected': active === id ? 'true' : 'false',
      onclick: function () { ctx.go('#/work/' + id); }
    }, label);
  }

  /* ------------------------------------------------------------- overview */

  function overview(ctx) {
    const pv = W.pipelineValue(ctx.state);
    const owed = W.unpaid(ctx.state);
    const rr = W.responseRate(ctx.state, ctx.today);

    return C.card({ title: 'Pipeline' }, [
      C.statRow([
        C.stat({
          value: String(pv.applications.count),
          label: 'Live applications',
          note: pv.applications.expectedPence
            ? U.formatMoney(pv.applications.expectedPence, { compact: true }) + ' weighted'
            : null
        }),
        C.stat({
          value: String(pv.gigs.count),
          label: 'Open jobs',
          note: pv.gigs.expectedPence
            ? U.formatMoney(pv.gigs.expectedPence, { compact: true }) + ' weighted'
            : null
        }),
        C.stat({
          value: owed.totalPence ? U.formatMoney(owed.totalPence, { compact: true }) : '—',
          label: 'Owed to you',
          tone: owed.totalPence ? 'warning' : null
        })
      ]),
      rr.sample >= 5 ? h('p.card-note',
        Math.round(rr.pct) + '% of your ' + rr.sample +
        ' mature applications got a reply.') : null
    ]);
  }

  /* --------------------------------------------------------- applications */

  function applicationsPane(ctx) {
    const st = ctx.state;
    const follow = W.needsFollowUp(st, ctx.today);
    const followIds = {};
    follow.forEach(function (f) { followIds[f.application.id] = f.silentDays; });

    // Furthest through the process first, oldest first within a stage. Two
    // stable passes, because a negative number folded into a string key
    // sorts -0.45 ahead of -0.9 and reverses the whole list.
    const open = U.sortBy(
      U.sortBy(W.openApplications(st), function (a) { return a.appliedDate; }),
      function (a) { return -W.appMeta(a.status).weight; }
    );
    const closed = U.sortBy(W.closedApplications(st), function (a) { return a.updatedAt; }, 'desc');

    return [
      follow.length ? C.card({
        title: 'Worth a nudge',
        tone: 'warn'
      }, h('div.list', follow.slice(0, 5).map(function (f) {
        return C.row({
          title: f.application.company,
          subtitle: (f.application.role ? f.application.role + ' · ' : '') +
            'silent ' + U.plural(f.silentDays, 'day'),
          trailing: C.button('Chased', {
            size: 'sm', variant: 'ghost',
            onClick: function () {
              ctx.actions.updateApplication(f.application.id, { lastContact: ctx.today });
              C.toast('Marked as chased today');
            }
          }),
          onClick: function () { K.Forms.applicationEditor(ctx, f.application); }
        });
      }))) : null,

      C.card({
        title: 'Applications',
        // 'live' here is an adjective, so it must not be pluralised.
        subtitle: open.length ? open.length + ' live' : null,
        action: C.button('Add', {
          size: 'sm', onClick: function () { K.Forms.applicationEditor(ctx, null); }
        })
      }, open.length ? h('div.list', open.map(function (a) {
        return applicationRow(ctx, a, followIds[a.id]);
      })) : C.empty('No live applications. When you send one, log it here so the follow-ups look after themselves.')),

      closed.length ? C.card({
        title: 'Closed',
        subtitle: U.plural(closed.length, 'application')
      }, h('div.list.is-muted', closed.slice(0, 15).map(function (a) {
        return C.row({
          title: a.company,
          subtitle: (a.role ? a.role + ' · ' : '') + W.appMeta(a.status).label,
          onClick: function () { K.Forms.applicationEditor(ctx, a); }
        });
      }))) : null
    ];
  }

  function applicationRow(ctx, a, silentDays) {
    const meta = W.appMeta(a.status);
    const age = U.daysBetween(a.appliedDate, ctx.today);

    return h('div.pipeline-item', [
      h('button.pipeline-main', {
        type: 'button',
        onclick: function () { K.Forms.applicationEditor(ctx, a); }
      }, [
        h('div.pipeline-title', [
          a.company,
          a.salaryPence ? h('span.pipeline-amount',
            U.formatMoney(a.salaryPence, { compact: true })) : null
        ]),
        h('div.pipeline-sub', [
          a.role || 'Role not set',
          ' · applied ' + U.plural(age === null ? 0 : age, 'day') + ' ago',
          a.nextActionDate ? ' · ' + (a.nextAction || 'next step') + ' ' +
            U.relativeDay(a.nextActionDate, ctx.today) : ''
        ])
      ]),
      h('div.pipeline-foot', [
        C.pill(meta.label, stageTone(a.status)),
        silentDays ? C.pill('quiet ' + silentDays + 'd', 'warning') : null,
        h('div.pipeline-actions', [
          C.iconButton('→', {
            label: 'Move ' + a.company + ' to the next stage',
            onClick: function () { advanceApplication(ctx, a); }
          })
        ])
      ])
    ]);
  }

  function stageTone(status) {
    if (['offer', 'accepted'].indexOf(status) >= 0) return 'good';
    if (['interview', 'final'].indexOf(status) >= 0) return 'info';
    if (['rejected', 'withdrawn'].indexOf(status) >= 0) return 'muted';
    return null;
  }

  function advanceApplication(ctx, a) {
    C.sheet({
      title: a.company,
      content: h('div.stage-picker', M.APP_STATUSES.map(function (s) {
        return h('button.stage-option' + (s.id === a.status ? '.is-active' : ''), {
          type: 'button',
          onclick: function () {
            C.closeSheet();
            ctx.actions.setApplicationStatus(a.id, s.id);
            C.toast(a.company + ' → ' + s.label);
          }
        }, [
          h('span.stage-name', s.label),
          s.weight > 0 && s.weight < 1
            ? h('span.stage-weight', Math.round(s.weight * 100) + '% odds')
            : null
        ]);
      }))
    });
  }

  /* ------------------------------------------------------------------ gigs */

  function gigsPane(ctx) {
    const st = ctx.state;
    const open = U.sortBy(W.openGigs(st), function (g) {
      return g.dueDate || '9999-12-31';
    });
    const done = st.gigs.filter(function (g) {
      return ['paid', 'lost'].indexOf(g.status) >= 0;
    });
    const owed = W.unpaid(st);
    const rate = W.effectiveRate(st);
    const acc = W.estimateAccuracy(st);

    return [
      owed.items.length ? C.card({
        title: 'Waiting on payment',
        subtitle: U.formatMoney(owed.totalPence) + ' outstanding',
        tone: 'warn'
      }, h('div.list', owed.items.map(function (i) {
        return C.row({
          title: i.gig.client,
          subtitle: i.gig.title || W.gigMeta(i.gig.status).label,
          trailing: C.button('Paid', {
            size: 'sm',
            onClick: function () {
              ctx.actions.setGigStatus(i.gig.id, 'paid');
              C.toast('Logged as paid and added to income');
            }
          }),
          onClick: function () { K.Forms.gigEditor(ctx, i.gig); }
        });
      }))) : null,

      C.card({
        title: 'Freelance jobs',
        action: C.button('Add', {
          size: 'sm', onClick: function () { K.Forms.gigEditor(ctx, null); }
        })
      }, open.length ? h('div.list', open.map(function (g) {
        return gigRow(ctx, g);
      })) : C.empty('No open jobs. Log enquiries here too — quoted work you never hear back about is data worth having.')),

      (rate || acc) ? C.card({ title: 'What the work is really worth' }, [
        rate ? C.statRow([
          C.stat({
            value: U.formatMoney(rate.pencePerHour),
            unit: '/hr',
            label: 'Realised rate',
            note: U.plural(rate.jobs, 'paid job') + ' · ' + rate.hours + ' hours'
          })
        ]) : null,
        acc ? h('p.card-note',
          'Your jobs take a median of ' + acc.medianRatio + '× your estimate, over ' +
          U.plural(acc.jobs, 'finished job') + '. ' +
          (acc.medianRatio > 1.15
            ? 'Quoting that multiple would leave you whole.'
            : 'Your estimates are holding up.')) : null
      ]) : null,

      done.length ? C.card({
        title: 'Finished',
        subtitle: U.plural(done.length, 'job')
      }, h('div.list.is-muted', U.sortBy(done, function (g) { return g.updatedAt; }, 'desc')
        .slice(0, 12).map(function (g) {
          return C.row({
            title: g.client,
            subtitle: (g.title ? g.title + ' · ' : '') + W.gigMeta(g.status).label,
            trailing: g.paidPence
              ? h('strong.row-amount.tone-good', U.formatMoney(g.paidPence, { round: true }))
              : null,
            onClick: function () { K.Forms.gigEditor(ctx, g); }
          });
        }))) : null
    ];
  }

  function gigRow(ctx, g) {
    const meta = W.gigMeta(g.status);
    const overdue = g.dueDate && U.daysBetween(ctx.today, g.dueDate) < 0 && g.status !== 'delivered';
    const overrun = g.hoursEstimate > 0 && g.hoursLogged > g.hoursEstimate;

    return h('div.pipeline-item', [
      h('button.pipeline-main', {
        type: 'button',
        onclick: function () { K.Forms.gigEditor(ctx, g); }
      }, [
        h('div.pipeline-title', [
          g.client,
          g.quotedPence ? h('span.pipeline-amount',
            U.formatMoney(g.quotedPence, { compact: true })) : null
        ]),
        h('div.pipeline-sub', [
          g.title || 'Untitled job',
          g.dueDate ? ' · due ' + U.relativeDay(g.dueDate, ctx.today) : '',
          g.hoursEstimate ? ' · ' + (g.hoursLogged || 0) + '/' + g.hoursEstimate + 'h' : ''
        ])
      ]),
      h('div.pipeline-foot', [
        C.pill(meta.label, g.status === 'paid' ? 'good' : null),
        overdue ? C.pill('overdue', 'critical') : null,
        overrun ? C.pill('over hours', 'warning') : null,
        h('div.pipeline-actions', [
          C.iconButton('→', {
            label: 'Move ' + g.client + ' to the next stage',
            onClick: function () { advanceGig(ctx, g); }
          })
        ])
      ])
    ]);
  }

  function advanceGig(ctx, g) {
    C.sheet({
      title: g.client,
      content: h('div.stage-picker', M.GIG_STATUSES.map(function (s) {
        return h('button.stage-option' + (s.id === g.status ? '.is-active' : ''), {
          type: 'button',
          onclick: function () {
            C.closeSheet();
            ctx.actions.setGigStatus(g.id, s.id);
            C.toast(s.id === 'paid'
              ? 'Marked paid — income logged'
              : g.client + ' → ' + s.label);
          }
        }, h('span.stage-name', s.label));
      }))
    });
  }
})(globalThis.Keel = globalThis.Keel || {});
