/* Keel — Tasks: everything open, grouped the way you actually think about it. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, T = K.Tasks;

  K.Screens = K.Screens || {};

  const VIEWS = [
    { id: 'now', label: 'Now' },
    { id: 'projects', label: 'Projects' },
    { id: 'someday', label: 'Someday' },
    { id: 'done', label: 'Done' }
  ];

  K.Screens.tasks = {
    render: function (ctx) {
      const view = ctx.param || 'now';
      return [
        header(ctx),
        h('div.segmented', { role: 'tablist' }, VIEWS.map(function (v) {
          return h('button.seg' + (view === v.id ? '.is-active' : ''), {
            type: 'button', role: 'tab',
            'aria-selected': view === v.id ? 'true' : 'false',
            onclick: function () { ctx.go('#/tasks/' + v.id); }
          }, v.label);
        })),
        view === 'projects' ? projectsView(ctx)
          : view === 'someday' ? somedayView(ctx)
          : view === 'done' ? doneView(ctx)
          : nowView(ctx)
      ];
    }
  };

  function header(ctx) {
    const counts = T.counts(ctx.state, ctx.today);
    return C.card({ class: 'tasks-head' }, [
      C.statRow([
        C.stat({ value: String(counts.active), label: 'Open' }),
        C.stat({
          value: String(counts.overdue), label: 'Overdue',
          tone: counts.overdue ? 'critical' : null
        }),
        C.stat({ value: String(counts.dueToday), label: 'Due today' })
      ]),
      h('div.quick-add', [
        h('input.input', {
          type: 'text',
          placeholder: 'Add a task…',
          'data-focus-key': 'tasks-quick',
          enterkeyhint: 'done',
          onkeydown: function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const v = e.target.value.trim();
            if (!v) return;
            ctx.actions.addTask({ title: v });
            e.target.value = '';
          }
        }),
        C.button('More', {
          variant: 'ghost', size: 'sm',
          onClick: function () { K.Forms.taskEditor(ctx, null); }
        })
      ])
    ]);
  }

  /* ------------------------------------------------------------------ now */

  function nowView(ctx) {
    const st = ctx.state, day = ctx.today;
    const overdue = T.overdue(st, day);
    const today = T.dueToday(st, day);
    const soon = T.dueWithin(st, 7, day).filter(function (t) {
      return U.daysBetween(day, t.dueDate) > 0;
    });
    const undated = T.active(st).filter(function (t) { return !t.dueDate; });

    return [
      group(ctx, 'Overdue', overdue, 'critical'),
      group(ctx, 'Today', today),
      group(ctx, 'Next seven days', soon),
      group(ctx, 'No date', U.sortBy(undated, function (t) {
        return -t.priority + '|' + t.createdAt;
      })),
      (!overdue.length && !today.length && !soon.length && !undated.length)
        ? C.card({}, C.empty('Nothing open. Enjoy it.')) : null
    ];
  }

  function group(ctx, title, list, tone) {
    if (!list.length) return null;
    return C.card({
      title: title,
      subtitle: U.plural(list.length, 'task'),
      tone: tone === 'critical' ? 'warn' : null
    }, h('div.list', list.map(function (t) { return taskRow(ctx, t); })));
  }

  function taskRow(ctx, t) {
    const day = ctx.today;
    const project = t.projectId
      ? ctx.state.projects.filter(function (p) { return p.id === t.projectId; })[0]
      : null;
    const late = t.dueDate && U.daysBetween(day, t.dueDate) < 0;
    const bits = [];
    if (project) bits.push(project.name);
    if (t.dueDate) bits.push(U.relativeDay(t.dueDate, day));
    if (t.priority === 3) bits.push('High');

    return C.checkRow({
      done: t.done,
      title: t.title,
      subtitle: bits.length ? bits.join(' · ') : null,
      onToggle: function () {
        ctx.actions.toggleTask(t.id);
        if (!t.done) C.toast('Done', {
          actionLabel: 'Undo', onAction: function () { ctx.store.undo(); }
        });
      },
      onOpen: function () { K.Forms.taskEditor(ctx, t); },
      trailing: late ? C.pill('late', 'critical') : null
    });
  }

  /* ------------------------------------------------------------- projects */

  function projectsView(ctx) {
    const groups = T.byProject(ctx.state);
    return [
      C.card({
        title: 'Projects',
        action: C.button('Add', {
          size: 'sm', onClick: function () { K.Forms.projectEditor(ctx, null); }
        })
      }, groups.length ? null : C.empty('No projects yet.')),
      groups.map(function (g) {
        const open = g.tasks.filter(function (t) { return !t.done; });
        return C.card({
          title: g.project.name,
          subtitle: g.open + ' open · ' + g.done + ' done',
          action: g.project.id ? C.iconButton('✎', {
            label: 'Edit ' + g.project.name,
            onClick: function () { K.Forms.projectEditor(ctx, g.project); }
          }) : null
        }, open.length
          ? h('div.list', U.sortBy(open, function (t) {
              return (t.dueDate || '9999') + '|' + (9 - t.priority);
            }).map(function (t) { return taskRow(ctx, t); }))
          : C.empty('Nothing open here.'));
      })
    ];
  }

  /* -------------------------------------------------------------- someday */

  function somedayView(ctx) {
    const list = T.open(ctx.state).filter(function (t) { return t.someday; });
    const stale = T.stale(ctx.state, 30, ctx.today);

    return [
      C.card({
        title: 'Someday',
        subtitle: 'Out of the way, not forgotten'
      }, list.length
        ? h('div.list', list.map(function (t) { return taskRow(ctx, t); }))
        : C.empty('Nothing parked. Anything you are not doing this month probably belongs here.')),

      stale.length ? C.card({
        title: 'Sitting a while',
        subtitle: 'Open for over a month — usually these want deleting, not doing'
      }, h('div.list', stale.slice(0, 10).map(function (s) {
        return C.row({
          title: s.task.title,
          subtitle: U.plural(s.ageDays, 'day') + ' old',
          trailing: h('div.row-actions', [
            C.button('Park', {
              size: 'sm', variant: 'ghost',
              onClick: function () { ctx.actions.updateTask(s.task.id, { someday: true }); }
            }),
            C.button('Drop', {
              size: 'sm', variant: 'danger-ghost',
              onClick: function () {
                ctx.actions.deleteTask(s.task.id);
                C.toast('Dropped', {
                  actionLabel: 'Undo', onAction: function () { ctx.store.undo(); }
                });
              }
            })
          ])
        });
      }))) : null
    ];
  }

  /* ----------------------------------------------------------------- done */

  function doneView(ctx) {
    const done = U.sortBy(ctx.state.tasks.filter(function (t) { return t.done; }),
      function (t) { return t.doneDate || ''; }, 'desc');
    const weeks = T.throughput(ctx.state, 8, ctx.today);
    const byDay = U.groupBy(done.slice(0, 60), function (t) { return t.doneDate || 'undated'; });
    const days = Object.keys(byDay).sort().reverse();

    return [
      C.card({ title: 'Finished per week' },
        K.Charts.rankedBars(weeks.map(function (w) {
          return {
            label: U.formatDate(w.weekStart, 'short'),
            value: w.completed,
            display: String(w.completed)
          };
        }), { emptyText: 'Nothing finished yet' })),

      C.card({
        title: 'Done',
        subtitle: U.plural(done.length, 'task'),
        action: done.length ? C.button('Clear', {
          size: 'sm', variant: 'ghost',
          onClick: function () {
            C.confirmSheet({
              title: 'Clear completed tasks?',
              message: 'This removes ' + U.plural(done.length, 'finished task') +
                '. Your weekly counts are worked out from these, so past weeks will read as emptier.',
              confirmLabel: 'Clear',
              danger: true,
              onConfirm: function () {
                ctx.actions.clearCompletedTasks();
                C.toast('Cleared', {
                  actionLabel: 'Undo', onAction: function () { ctx.store.undo(); }
                });
              }
            });
          }
        }) : null
      }, days.length ? days.map(function (d) {
        return h('div.txn-day', [
          h('div.txn-dayhead', h('span',
            d === 'undated' ? 'No date' : U.formatDate(d, 'medium'))),
          h('div.list', byDay[d].map(function (t) { return taskRow(ctx, t); }))
        ]);
      }) : C.empty('Nothing finished yet.'))
    ];
  }
})(globalThis.Keel = globalThis.Keel || {});
