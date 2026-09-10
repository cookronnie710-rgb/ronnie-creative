/* Keel — Today: the one screen that has to earn its place every morning. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, Ch = K.Charts;

  K.Screens = K.Screens || {};

  K.Screens.today = {
    render: function (ctx) {
      const st = ctx.state, day = ctx.today;

      return [
        st.settings.showOnboarding ? welcome(ctx) : null,
        greeting(ctx),
        focusCard(ctx, day),
        insightsCard(ctx),
        habitsCard(ctx, day),
        tasksCard(ctx, day),
        checkinCard(ctx, day),
        moneyCard(ctx),
        workCard(ctx),
        reviewNudge(ctx),
        journalCard(ctx, day)
      ];
    }
  };

  /* -------------------------------------------------------------- welcome */

  function welcome(ctx) {
    return C.card({ tone: 'accent' }, [
      h('h2.welcome-title', 'This is Keel.'),
      h('p.welcome-text',
        'One place for the parts of life that are usually scattered across ' +
        'different apps — money, work, habits, health, tasks and notes — so they ' +
        'can be looked at together.'),
      h('p.welcome-text',
        'Everything stays on this device. Nothing is uploaded, and there is no ' +
        'account. Back it up from Settings now and then.'),
      h('p.welcome-text.welcome-quiet',
        'The habits and projects below are examples. Change or delete them freely.'),
      h('div.welcome-actions', [
        C.button('Start', {
          variant: 'primary',
          onClick: function () { ctx.actions.dismissOnboarding(); }
        })
      ])
    ]);
  }

  /* ------------------------------------------------------------- greeting */

  function greeting(ctx) {
    const hour = new Date().getHours();
    const name = ctx.state.profile.name;
    const part = hour < 5 ? 'Still up' : hour < 12 ? 'Morning'
      : hour < 18 ? 'Afternoon' : 'Evening';
    return h('div.greeting', [
      h('h1.greeting-text', part + (name ? ', ' + name : '')),
      h('p.greeting-date', U.formatDate(ctx.today, 'long'))
    ]);
  }

  /* ---------------------------------------------------------------- focus */

  function focusCard(ctx, day) {
    const f = ctx.state.focus[day];
    return C.card({ title: "Today's one thing" }, [
      f && f.text
        ? h('div.focus-set' + (f.done ? '.is-done' : ''), [
            h('button.check.check-lg', {
              type: 'button',
              role: 'checkbox',
              'aria-checked': f.done ? 'true' : 'false',
              'aria-label': 'Mark focus done',
              onclick: function () { ctx.actions.toggleFocusDone(day); }
            }, f.done ? '✓' : ''),
            h('p.focus-text', f.text),
            C.iconButton('✕', {
              label: 'Clear focus',
              onClick: function () { ctx.actions.setFocus(day, ''); ctx.refresh(); }
            })
          ])
        : h('input.input.focus-input', {
            type: 'text',
            placeholder: 'If only one thing happens today, what is it?',
            'data-focus-key': 'today-focus',
            enterkeyhint: 'done',
            onkeydown: function (e) {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const v = e.target.value.trim();
              if (!v) return;
              ctx.actions.setFocus(day, v);
              ctx.refresh();
            },
            onblur: function (e) {
              const v = e.target.value.trim();
              if (!v) return;
              ctx.actions.setFocus(day, v);
              ctx.refresh();
            }
          })
    ]);
  }

  /* ------------------------------------------------------------- insights */

  function insightsCard(ctx) {
    const list = K.Insights.top(ctx.state, 3, ctx.today);
    if (!list.length) return null;
    return h('div.insights', list.map(function (i) {
      return h('button.insight.tone-' + i.severity, {
        type: 'button',
        onclick: function () { if (i.route) ctx.go(i.route); }
      }, [
        h('span.insight-mark', { 'aria-hidden': 'true' }, severityIcon(i.severity)),
        h('div.insight-body', [
          h('div.insight-title', i.title),
          h('div.insight-detail', i.detail)
        ])
      ]);
    }));
  }

  function severityIcon(sev) {
    return sev === 'urgent' ? '!' : sev === 'warn' ? '▲' : sev === 'good' ? '✓' : 'i';
  }

  /* --------------------------------------------------------------- habits */

  function habitsCard(ctx, day) {
    const view = K.Habits.todayView(ctx.state, day);
    if (!view.length) {
      return C.card({
        title: 'Habits',
        action: C.button('Add', {
          size: 'sm', onClick: function () { K.Forms.habitEditor(ctx, null); }
        })
      }, C.empty('No habits yet. Start with one you could do on your worst day.'));
    }

    const doneCount = view.filter(function (v) { return v.done; }).length;

    return C.card({
      title: 'Habits',
      subtitle: doneCount + ' of ' + view.length + ' today',
      action: h('a.card-link', { href: '#/life/habits' }, 'All')
    }, h('div.habit-strip', view.map(function (v) {
      const st = v.streak;
      return h('button.habit-tile' + (v.done ? '.is-done' : '') +
        (!v.needed && !v.done ? '.is-met' : ''), {
        type: 'button',
        'aria-pressed': v.done ? 'true' : 'false',
        'aria-label': v.habit.name + (v.done ? ', done today' : ', not done today'),
        onclick: function () { ctx.actions.toggleHabit(v.habit.id, day); }
      }, [
        h('span.habit-emoji', { 'aria-hidden': 'true' }, v.habit.emoji),
        h('span.habit-name', v.habit.name),
        h('span.habit-meta', habitMeta(v))
      ]);
    })));
  }

  function habitMeta(v) {
    if (v.habit.cadence === 'weekly') return v.week.done + '/' + v.week.target + ' this week';
    if (v.streak.current > 0) return v.streak.current + ' day' + (v.streak.current === 1 ? '' : 's');
    return 'start today';
  }

  /* ---------------------------------------------------------------- tasks */

  function tasksCard(ctx, day) {
    const list = K.Tasks.todayList(ctx.state, day, 5);
    const counts = K.Tasks.counts(ctx.state, day);

    return C.card({
      title: 'Tasks',
      subtitle: counts.overdue
        ? U.plural(counts.overdue, 'overdue item')
        : (counts.active ? U.plural(counts.active, 'open') : null),
      action: h('a.card-link', { href: '#/tasks' }, 'All')
    }, [
      h('div.quick-add', [
        h('input.input', {
          type: 'text',
          placeholder: 'Add a task…',
          'data-focus-key': 'today-quick-task',
          enterkeyhint: 'done',
          onkeydown: function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const v = e.target.value.trim();
            if (!v) return;
            ctx.actions.addTask({ title: v });
            e.target.value = '';
          }
        })
      ]),
      list.length
        ? h('div.list', list.map(function (t) { return taskRow(ctx, t, day); }))
        : C.empty('Nothing due. A clear day is allowed to just be a clear day.')
    ]);
  }

  function taskRow(ctx, t, day) {
    const overdue = t.dueDate && U.daysBetween(day, t.dueDate) < 0;
    return C.checkRow({
      done: t.done,
      title: t.title,
      subtitle: t.dueDate
        ? (overdue ? 'Overdue — due ' + U.relativeDay(t.dueDate, day) : 'Due ' + U.relativeDay(t.dueDate, day))
        : (t.priority === 3 ? 'High priority' : null),
      onToggle: function () { ctx.actions.toggleTask(t.id); },
      onOpen: function () { K.Forms.taskEditor(ctx, t); },
      trailing: overdue ? C.pill('late', 'critical') : null
    });
  }

  /* ------------------------------------------------------------- check-in */

  function checkinCard(ctx, day) {
    const c = ctx.state.checkins[day] || {};
    const set = function (field) {
      return function (v) {
        ctx.actions.setCheckin(day, defineField(field, v));
        ctx.refresh();
      };
    };

    return C.card({
      title: 'Check-in',
      subtitle: 'Takes ten seconds. It is what makes the patterns show up.'
    }, [
      h('div.checkin-grid', [
        h('div.checkin-item', [
          h('span.checkin-label', 'Energy'),
          C.scale({
            value: c.energy, label: 'Energy today',
            labels: ['Empty', 'Low', 'Okay', 'Good', 'Full'],
            onSelect: set('energy')
          })
        ]),
        h('div.checkin-item', [
          h('span.checkin-label', 'Mood'),
          C.scale({
            value: c.mood, label: 'Mood today',
            labels: ['Rough', 'Low', 'Fine', 'Good', 'Great'],
            onSelect: set('mood')
          })
        ])
      ]),
      h('div.checkin-row', [
        stepper({
          label: 'Sleep', unit: 'h', step: 0.5, min: 0, max: 14,
          value: c.sleepHours,
          onChange: set('sleepHours')
        }),
        stepper({
          label: 'Movement', unit: 'min', step: 10, min: 0, max: 240,
          value: c.exerciseMins,
          onChange: set('exerciseMins')
        })
      ])
    ]);
  }

  function defineField(field, v) {
    const o = {};
    o[field] = v;
    return o;
  }

  function stepper(opts) {
    const value = opts.value;
    const has = value !== null && value !== undefined;
    function bump(delta) {
      const next = U.clamp((has ? value : (opts.start || 0)) + delta, opts.min, opts.max);
      opts.onChange(U.round(next, 2));
    }
    return h('div.stepper', [
      h('span.stepper-label', opts.label),
      h('div.stepper-controls', [
        h('button.stepper-btn', {
          type: 'button', 'aria-label': 'Less ' + opts.label,
          onclick: function () { bump(-opts.step); }
        }, '−'),
        h('button.stepper-value' + (has ? '' : '.is-unset'), {
          type: 'button',
          'aria-label': opts.label + (has ? ' ' + value + opts.unit : ' not set'),
          onclick: function () { opts.onChange(has ? null : (opts.start || opts.step)); }
        }, has ? [String(value), h('span.stepper-unit', opts.unit)] : '—'),
        h('button.stepper-btn', {
          type: 'button', 'aria-label': 'More ' + opts.label,
          onclick: function () { bump(opts.step); }
        }, '+')
      ])
    ]);
  }

  /* ---------------------------------------------------------------- money */

  function moneyCard(ctx) {
    const st = ctx.state;
    const r = K.Money.runway(st, ctx.today);
    const monthKey = U.monthKey(ctx.today);
    const month = K.Money.monthSummary(st, monthKey);

    return C.card({
      title: 'Money',
      action: h('a.card-link', { href: '#/money' }, 'Open')
    }, [
      C.statRow([
        C.stat({
          value: U.formatMoney(st.money.cashPence, { round: true }),
          label: 'Cash'
        }),
        C.stat({
          value: r.months === null ? (r.status === 'growing' ? '↑' : '—') : String(r.months),
          unit: r.months === null ? '' : ' mo',
          label: 'Runway',
          tone: runwayTone(r.status),
          note: r.basis === 'planned' ? 'from your plan' : null
        }),
        C.stat({
          value: U.formatMoney(month.netPence, { round: true, plus: true }),
          label: 'This month',
          tone: month.netPence >= 0 ? 'good' : 'critical'
        })
      ]),
      h('div.quick-money', [
        C.button('Money out', {
          variant: 'ghost',
          onClick: function () { K.Forms.transactionEditor(ctx, null, { kind: 'expense' }); }
        }),
        C.button('Money in', {
          variant: 'ghost',
          onClick: function () { K.Forms.transactionEditor(ctx, null, { kind: 'income' }); }
        })
      ])
    ]);
  }

  function runwayTone(status) {
    return status === 'critical' ? 'critical'
      : status === 'low' ? 'warning'
      : status === 'growing' ? 'good' : null;
  }

  /* ----------------------------------------------------------------- work */

  function workCard(ctx) {
    const due = K.Work.dueActions(ctx.state, ctx.today);
    const follow = K.Work.needsFollowUp(ctx.state, ctx.today);
    if (!due.length && !follow.length) return null;

    return C.card({
      title: 'Work needs you',
      action: h('a.card-link', { href: '#/work' }, 'Open')
    }, h('div.list', [
      due.slice(0, 3).map(function (d) {
        return C.row({
          title: d.title,
          subtitle: d.subtitle + ' · ' + (d.overdueDays > 0
            ? U.plural(d.overdueDays, 'day') + ' late' : 'today'),
          trailing: C.pill(d.overdueDays > 0 ? 'late' : 'due',
            d.overdueDays > 0 ? 'critical' : 'warning'),
          onClick: function () { ctx.go('#/work'); }
        });
      }),
      follow.slice(0, 2).map(function (f) {
        return C.row({
          title: f.application.company,
          subtitle: 'No word for ' + U.plural(f.silentDays, 'day'),
          trailing: C.pill('chase', 'warning'),
          onClick: function () { K.Forms.applicationEditor(ctx, f.application); }
        });
      })
    ]));
  }

  /* ---------------------------------------------------------- review nudge */

  function reviewNudge(ctx) {
    const st = ctx.state;
    const dow = U.dayOfWeek(ctx.today);
    if (dow !== st.settings.reviewWeekday) return null;

    const weekStart = K.Review.reviewWeekStart(st, ctx.today);
    const key = U.isoWeekKey(weekStart);
    if (K.Review.savedReview(st, key)) return null;

    return C.card({ tone: 'accent' }, [
      h('h2.card-title', 'Time for the weekly review'),
      h('p.card-text',
        'Fifteen minutes looking back is worth more than most of the hours ' +
        'that went into the week.'),
      C.button('Start the review', {
        variant: 'primary',
        onClick: function () { ctx.go('#/review'); }
      })
    ]);
  }

  /* -------------------------------------------------------------- journal */

  function journalCard(ctx, day) {
    const j = ctx.state.journal[day] || {};
    return C.card({
      title: 'Note to self',
      action: h('a.card-link', { href: '#/life/journal' }, 'All')
    }, [
      h('textarea.input.textarea.journal-quick', {
        rows: 3,
        placeholder: 'How was today? Anything worth remembering?',
        'data-focus-key': 'today-journal',
        value: j.text || '',
        oninput: function (e) { ctx.actions.setJournal(day, { text: e.target.value }); }
      }),
      h('input.input.journal-win', {
        type: 'text',
        placeholder: "Today's win, however small",
        'data-focus-key': 'today-win',
        value: j.win || '',
        oninput: function (e) { ctx.actions.setJournal(day, { win: e.target.value }); }
      })
    ]);
  }
})(globalThis.Keel = globalThis.Keel || {});
