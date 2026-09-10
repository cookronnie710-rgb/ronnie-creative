/* Keel — Life: habits, body, and the written record. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, Ha = K.Habits, He = K.Health, Ch = K.Charts;

  K.Screens = K.Screens || {};

  K.Screens.life = {
    render: function (ctx) {
      const tab = ctx.param || 'habits';
      return [
        h('div.segmented', { role: 'tablist' }, [
          seg('Habits', 'habits', tab, ctx),
          seg('Body', 'health', tab, ctx),
          seg('Journal', 'journal', tab, ctx)
        ]),
        tab === 'health' ? healthPane(ctx)
          : tab === 'journal' ? journalPane(ctx)
          : habitsPane(ctx)
      ];
    }
  };

  function seg(label, id, active, ctx) {
    return h('button.seg' + (active === id ? '.is-active' : ''), {
      type: 'button', role: 'tab', 'aria-selected': active === id ? 'true' : 'false',
      onclick: function () { ctx.go('#/life/' + id); }
    }, label);
  }

  /* --------------------------------------------------------------- habits */

  function habitsPane(ctx) {
    const st = ctx.state;
    const habits = Ha.activeHabits(st);
    const archived = st.habits.filter(function (x) { return x.archived; });
    const overall = Ha.overallRate(st, 30, ctx.today);

    return [
      habits.length ? C.card({
        title: 'Last 30 days',
        subtitle: overall === null ? null : Math.round(overall) + '% of everything you set out to do'
      }, [
        Ch.heatmap(Ha.heatmap(st, null, 12, ctx.today), {
          maxCount: Math.max(1, habits.length)
        }),
        // On a dark surface the ramp runs the other way: an untouched day
        // recedes into the background and a full one is brightest.
        h('p.card-note', 'Every habit combined. Brighter means more done that day.')
      ]) : null,

      C.card({
        title: 'Your habits',
        action: C.button('Add', {
          size: 'sm', onClick: function () { K.Forms.habitEditor(ctx, null); }
        })
      }, habits.length ? h('div.habit-list', habits.map(function (hab) {
        return habitDetail(ctx, hab);
      })) : C.empty(
        'No habits yet. Pick one thing small enough that you could do it on ' +
        'your worst day, and start there.'
      )),

      archived.length ? C.card({ title: 'Archived' },
        h('div.list.is-muted', archived.map(function (hab) {
          return C.row({
            title: hab.emoji + ' ' + hab.name,
            trailing: C.button('Restore', {
              size: 'sm', variant: 'ghost',
              onClick: function () { ctx.actions.updateHabit(hab.id, { archived: false }); }
            })
          });
        }))) : null
    ];
  }

  function habitDetail(ctx, hab) {
    const st = ctx.state;
    const streak = Ha.streak(st, hab, ctx.today);
    const rate = Ha.completionRate(st, hab, 30, ctx.today);
    const week = Ha.weekProgress(st, hab, ctx.today);
    const doneToday = Ha.isDone(st, hab.id, ctx.today);

    return h('div.habit-detail', [
      h('div.habit-detail-head', [
        h('button.habit-check' + (doneToday ? '.is-done' : ''), {
          type: 'button',
          role: 'checkbox',
          'aria-checked': doneToday ? 'true' : 'false',
          'aria-label': hab.name + (doneToday ? ', done today' : ', not done today'),
          onclick: function () { ctx.actions.toggleHabit(hab.id, ctx.today); }
        }, doneToday ? '✓' : hab.emoji),
        h('button.habit-detail-body', {
          type: 'button',
          onclick: function () { K.Forms.habitEditor(ctx, hab); }
        }, [
          h('div.habit-detail-name', hab.name),
          h('div.habit-detail-meta', [
            streak.current > 0
              ? h('strong', streak.current + ' ' + streak.unit + (streak.current === 1 ? '' : 's') + ' running')
              : 'No streak yet',
            rate.pct !== null ? ' · ' + Math.round(rate.pct) + '% of 30 days' : '',
            hab.cadence === 'weekly' ? ' · ' + week.done + '/' + week.target + ' this week' : ''
          ])
        ])
      ]),
      h('div.habit-week', U.dateRange(week.weekStart, U.addDays(week.weekStart, 6))
        .map(function (d, i) {
          const isFuture = U.daysBetween(ctx.today, d) > 0;
          const done = Ha.isDone(st, hab.id, d);
          return h('button.habit-day' + (done ? '.is-done' : '') +
            (isFuture ? '.is-future' : '') + (d === ctx.today ? '.is-today' : ''), {
            type: 'button',
            disabled: isFuture,
            'aria-label': U.formatDate(d, 'medium') + (done ? ', done' : ', not done'),
            onclick: function () { if (!isFuture) ctx.actions.toggleHabit(hab.id, d); }
          }, U.DAY_NAMES[i][0]);
        }))
    ]);
  }

  /* ---------------------------------------------------------------- health */

  function healthPane(ctx) {
    const st = ctx.state;
    const day = ctx.today;
    const logged = He.loggedDays(st, 30, day);
    const avgs = He.averages(st, 30, day);

    return [
      C.card({
        title: 'Today',
        subtitle: 'Logged on ' + logged.logged + ' of the last ' + logged.possible + ' days'
      }, fullCheckin(ctx, day)),

      C.card({ title: 'Last 30 days' }, [
        C.statRow(He.FIELDS.filter(function (f) {
          return ['sleepHours', 'energy', 'mood'].indexOf(f.id) >= 0;
        }).map(function (f) {
          const a = avgs[f.id];
          const t = He.trend(st, f.id, 14, day);
          return C.stat({
            value: a ? U.round(a.value, 1) : '—',
            unit: a ? f.unit : '',
            label: f.label,
            note: t ? trendNote(t, f) : (a ? U.plural(a.sample, 'day') : 'not logged')
          });
        })),

        h('h3.subhead', 'Sleep'),
        Ch.sparkline(He.series(st, 'sleepHours', 30, day), {
          unit: 'h', label: 'Sleep over 30 days',
          emptyText: 'Log sleep for a few days to see the shape of it'
        }),

        h('h3.subhead', 'Mood'),
        Ch.sparkline(He.series(st, 'mood', 30, day), {
          unit: '/5', min: 1, max: 5, label: 'Mood over 30 days',
          emptyText: 'Log your mood for a few days to see the shape of it'
        })
      ]),

      crossCard(ctx)
    ];
  }

  function trendNote(t, f) {
    const d = U.round(t.delta, 1);
    if (Math.abs(d) < 0.1) return 'steady';
    return (d > 0 ? '↑ ' : '↓ ') + Math.abs(d) + ' vs before';
  }

  function fullCheckin(ctx, day) {
    const c = ctx.state.checkins[day] || {};
    function set(field) {
      return function (v) {
        ctx.actions.setCheckin(day, single(field, v));
        ctx.refresh();
      };
    }
    return [
      h('div.checkin-grid', [
        h('div.checkin-item', [
          h('span.checkin-label', 'Energy'),
          C.scale({ value: c.energy, label: 'Energy', onSelect: set('energy') })
        ]),
        h('div.checkin-item', [
          h('span.checkin-label', 'Mood'),
          C.scale({ value: c.mood, label: 'Mood', onSelect: set('mood') })
        ])
      ]),
      h('div.checkin-fields', [
        numField('Sleep', 'sleepHours', 'h', 0.5, c, set),
        numField('Movement', 'exerciseMins', 'min', 5, c, set),
        numField('Water', 'water', 'glasses', 1, c, set),
        numField('Weight', 'weightKg', 'kg', 0.1, c, set)
      ]),
      C.field({
        label: 'Anything else',
        type: 'textarea', rows: 2,
        value: c.note || '',
        focusKey: 'checkin-note',
        placeholder: 'Slept badly, back playing up, felt great after the walk…',
        onInput: function (e) { ctx.actions.setCheckin(day, { note: e.target.value }); }
      })
    ];
  }

  function numField(label, field, unit, step, c, set) {
    const v = c[field];
    return C.field({
      label: label + ' (' + unit + ')',
      type: 'number',
      step: String(step),
      inputMode: 'decimal',
      focusKey: 'checkin-' + field,
      value: v === null || v === undefined ? '' : String(v),
      onInput: function (e) {
        const raw = e.target.value;
        set(field)(raw === '' ? null : Number(raw));
      }
    });
  }

  function single(field, v) { const o = {}; o[field] = v; return o; }

  function crossCard(ctx) {
    const list = K.Insights.crossInsights(ctx.state, ctx.today)
      .concat(K.Insights.healthInsights(ctx.state, ctx.today));
    if (!list.length) {
      return C.card({ title: 'Patterns' }, C.empty(
        'Keel compares sleep, mood, energy, movement, habits, tasks and spending ' +
        'against each other. It needs a couple of weeks of check-ins before it ' +
        'will say anything — a pattern found in four days is not a pattern.'
      ));
    }
    return C.card({
      title: 'Patterns',
      subtitle: 'What moves with what. Associations, not causes.'
    }, h('div.list', list.map(function (i) {
      return h('div.pattern', [
        h('div.pattern-title', i.title),
        h('div.pattern-detail', i.detail)
      ]);
    })));
  }

  /* --------------------------------------------------------------- journal */

  function journalPane(ctx) {
    const st = ctx.state;
    const day = ctx.today;
    const j = st.journal[day] || {};
    const past = Object.keys(st.journal).filter(function (d) { return d !== day; })
      .sort().reverse().slice(0, 40);

    return [
      C.card({ title: U.formatDate(day, 'long') }, [
        C.field({
          label: 'How was it?', type: 'textarea', rows: 5,
          value: j.text || '', focusKey: 'journal-text',
          placeholder: 'No prompts needed. Whatever is actually on your mind.',
          onInput: function (e) { ctx.actions.setJournal(day, { text: e.target.value }); }
        }),
        C.field({
          label: 'A win', value: j.win || '', focusKey: 'journal-win',
          placeholder: 'However small',
          onInput: function (e) { ctx.actions.setJournal(day, { win: e.target.value }); }
        }),
        C.field({
          label: 'Grateful for', value: j.grateful || '', focusKey: 'journal-grateful',
          onInput: function (e) { ctx.actions.setJournal(day, { grateful: e.target.value }); }
        }),
        C.field({
          label: 'Something learned', value: j.lesson || '', focusKey: 'journal-lesson',
          onInput: function (e) { ctx.actions.setJournal(day, { lesson: e.target.value }); }
        })
      ]),

      past.length ? C.card({
        title: 'Earlier',
        subtitle: U.plural(Object.keys(st.journal).length, 'entry', 'entries')
      }, h('div.journal-list', past.map(function (d) {
        const e = st.journal[d];
        const preview = (e.text || e.win || e.grateful || e.lesson || '').slice(0, 160);
        return h('button.journal-item', {
          type: 'button',
          onclick: function () { openEntry(ctx, d); }
        }, [
          h('div.journal-date', U.formatDate(d, 'medium')),
          h('div.journal-preview', preview + (preview.length >= 160 ? '…' : '')),
          e.win ? h('div.journal-win', '★ ' + e.win) : null
        ]);
      }))) : null
    ];
  }

  function openEntry(ctx, day) {
    const e = ctx.state.journal[day] || {};
    C.sheet({
      title: U.formatDate(day, 'long'),
      content: [
        C.field({
          label: 'Entry', type: 'textarea', rows: 8, value: e.text || '',
          focusKey: 'entry-text',
          onInput: function (ev) { ctx.actions.setJournal(day, { text: ev.target.value }); }
        }),
        C.field({
          label: 'Win', value: e.win || '', focusKey: 'entry-win',
          onInput: function (ev) { ctx.actions.setJournal(day, { win: ev.target.value }); }
        }),
        C.field({
          label: 'Grateful for', value: e.grateful || '', focusKey: 'entry-grateful',
          onInput: function (ev) { ctx.actions.setJournal(day, { grateful: ev.target.value }); }
        }),
        C.field({
          label: 'Lesson', value: e.lesson || '', focusKey: 'entry-lesson',
          onInput: function (ev) { ctx.actions.setJournal(day, { lesson: ev.target.value }); }
        })
      ],
      footer: C.button('Done', {
        variant: 'primary',
        onClick: function () { C.closeSheet(); ctx.refresh(); }
      })
    });
  }
})(globalThis.Keel = globalThis.Keel || {});
