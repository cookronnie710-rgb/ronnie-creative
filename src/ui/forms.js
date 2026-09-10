/* Keel — add/edit sheets. One editor per entity, reused everywhere. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, M = K.Model;

  // Collects field values into a draft object, so each editor is a plain
  // description of its fields plus one save handler.
  function editor(opts) {
    const o = opts || {};
    const draft = Object.assign({}, o.initial || {});
    const errors = {};

    function set(key, value) { draft[key] = value; }

    function save() {
      if (o.validate) {
        const problem = o.validate(draft);
        if (problem) { C.toast(problem, { tone: 'warning' }); return; }
      }
      C.closeSheet();
      o.onSave(draft);
    }

    const footer = [
      o.onDelete
        ? C.button('Delete', {
            variant: 'danger-ghost',
            onClick: function () {
              C.closeSheet();
              C.confirmSheet({
                title: 'Delete this?',
                message: o.deleteMessage || 'This cannot be undone from here, but Undo in the header will bring it back.',
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: o.onDelete
              });
            }
          })
        : C.button('Cancel', { variant: 'ghost', onClick: C.closeSheet }),
      C.button(o.saveLabel || 'Save', { variant: 'primary', onClick: save })
    ];

    C.sheet({
      title: o.title,
      content: h('form.form', {
        onsubmit: function (e) { e.preventDefault(); save(); }
      }, o.fields(draft, set)),
      footer: footer
    });

    return { set: set, draft: draft };
  }

  function moneyField(label, key, draft, set, extra) {
    return C.field(Object.assign({
      label: label,
      type: 'text',
      inputMode: 'decimal',
      prefix: '£',
      value: draft[key] === null || draft[key] === undefined || draft[key] === ''
        ? '' : String(draft[key]),
      onInput: function (e) { set(key, e.target.value); }
    }, extra || {}));
  }

  function pence(v) {
    const p = U.parseMoney(v);
    return p === null ? 0 : Math.abs(p);
  }

  function poundsString(pence) {
    if (!pence) return '';
    return (pence / 100).toFixed(2).replace(/\.00$/, '');
  }

  function optionsFrom(list) {
    return list.map(function (i) { return { value: i.id, label: i.label }; });
  }

  /* ---------------------------------------------------------------- task */

  function taskEditor(ctx, task) {
    const isNew = !task;
    const projects = ctx.state.projects.filter(function (p) { return !p.archived; });
    editor({
      title: isNew ? 'New task' : 'Edit task',
      initial: {
        title: task ? task.title : '',
        projectId: task ? task.projectId : (projects[0] ? '' : ''),
        dueDate: task ? task.dueDate || '' : '',
        priority: task ? task.priority : 2,
        someday: task ? task.someday : false,
        notes: task ? task.notes : ''
      },
      validate: function (d) { return d.title.trim() ? null : 'Give the task a name.'; },
      fields: function (d, set) {
        return [
          C.field({
            label: 'Task', value: d.title, placeholder: 'What needs doing?',
            enterKeyHint: 'done', focusKey: 'task-title',
            onInput: function (e) { set('title', e.target.value); }
          }),
          C.fieldGroup([
            C.field({
              label: 'Due', type: 'date', value: d.dueDate,
              onInput: function (e) { set('dueDate', e.target.value); }
            }),
            C.field({
              label: 'Project', type: 'select', value: d.projectId || '',
              options: [{ value: '', label: 'None' }].concat(
                projects.map(function (p) { return { value: p.id, label: p.name }; })),
              onChange: function (e) { set('projectId', e.target.value || null); }
            })
          ]),
          h('div.field', [
            h('span.field-label', 'Priority'),
            C.chips({
              value: d.priority,
              options: M.PRIORITIES.map(function (p) { return { value: p.id, label: p.label }; }),
              onSelect: function (v) { set('priority', Number(v)); reopen(ctx, task, d, set); }
            })
          ]),
          C.field({
            label: 'Notes', type: 'textarea', rows: 3, value: d.notes,
            onInput: function (e) { set('notes', e.target.value); }
          }),
          h('label.toggle-row', [
            h('input', {
              type: 'checkbox', checked: d.someday,
              onchange: function (e) { set('someday', e.target.checked); }
            }),
            h('span', 'Someday — keep it out of the way for now')
          ])
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteTask(task.id);
        C.toast('Task deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          title: d.title.trim(),
          projectId: d.projectId || null,
          dueDate: d.dueDate || null,
          priority: d.priority,
          someday: d.someday,
          notes: d.notes
        };
        if (isNew) ctx.actions.addTask(fields);
        else ctx.actions.updateTask(task.id, fields);
      }
    });
  }

  // Chip groups mutate the draft but the sheet does not re-render itself;
  // reopening keeps the visible selection honest.
  function reopen(ctx, entity, draft, set) {
    // Deliberately a no-op: chips update their own active state via the DOM
    // below. Kept as a seam so a future editor can force a redraw.
  }

  /* --------------------------------------------------------- transaction */

  function transactionEditor(ctx, txn, defaults) {
    const isNew = !txn;
    const base = Object.assign({ kind: 'expense' }, defaults || {});
    editor({
      title: isNew ? (base.kind === 'income' ? 'Money in' : 'Money out') : 'Edit transaction',
      initial: {
        label: txn ? txn.label : '',
        kind: txn ? txn.kind : base.kind,
        amount: txn ? poundsString(txn.amountPence) : '',
        category: txn ? txn.category : 'other',
        stream: txn ? txn.stream || 'ebay' : 'ebay',
        date: txn ? txn.date : ctx.today,
        notes: txn ? txn.notes : ''
      },
      validate: function (d) {
        if (!d.label.trim()) return 'What was it for?';
        if (U.parseMoney(d.amount) === null) return 'Enter an amount.';
        return null;
      },
      fields: function (d, set) {
        const kindChips = h('div.field', [
          h('span.field-label', 'Direction'),
          C.chips({
            value: d.kind,
            options: [{ value: 'expense', label: 'Out' }, { value: 'income', label: 'In' }],
            onSelect: function (v) {
              set('kind', v);
              const wrap = document.querySelector('.form .cat-slot');
              if (wrap) K.Dom.mount(wrap, categorySlot(d, set));
            }
          })
        ]);
        return [
          C.field({
            label: 'What', value: d.label, focusKey: 'txn-label',
            placeholder: d.kind === 'income' ? 'PS2 bundle' : 'Tesco',
            onInput: function (e) { set('label', e.target.value); }
          }),
          C.fieldGroup([
            moneyField('Amount', 'amount', d, set, { focusKey: 'txn-amount' }),
            C.field({
              label: 'Date', type: 'date', value: d.date,
              onInput: function (e) { set('date', e.target.value); }
            })
          ]),
          kindChips,
          h('div.cat-slot', categorySlot(d, set)),
          C.field({
            label: 'Notes', type: 'textarea', rows: 2, value: d.notes,
            onInput: function (e) { set('notes', e.target.value); }
          })
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteTransaction(txn.id);
        C.toast('Transaction deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          label: d.label.trim(),
          kind: d.kind,
          amountPence: pence(d.amount),
          category: d.kind === 'expense' ? d.category : 'other',
          stream: d.kind === 'income' ? d.stream : null,
          date: d.date || ctx.today,
          notes: d.notes
        };
        if (isNew) ctx.actions.addTransaction(fields);
        else ctx.actions.updateTransaction(txn.id, fields);
      }
    });
  }

  function categorySlot(d, set) {
    if (d.kind === 'income') {
      return C.field({
        label: 'Income stream', type: 'select', value: d.stream,
        options: optionsFrom(M.STREAMS),
        onChange: function (e) { set('stream', e.target.value); }
      });
    }
    return C.field({
      label: 'Category', type: 'select', value: d.category,
      options: M.EXPENSE_CATEGORIES.map(function (c) {
        return { value: c, label: U.humanise(c) };
      }),
      onChange: function (e) { set('category', e.target.value); }
    });
  }

  /* ----------------------------------------------------------- recurring */

  function recurringEditor(ctx, item) {
    const isNew = !item;
    editor({
      title: isNew ? 'New regular item' : 'Edit regular item',
      initial: {
        label: item ? item.label : '',
        kind: item ? item.kind : 'expense',
        amount: item ? poundsString(item.amountPence) : '',
        cadence: item ? item.cadence : 'monthly',
        category: item ? item.category : 'bills',
        dueDay: item && item.dueDay ? String(item.dueDay) : '',
        active: item ? item.active : true
      },
      validate: function (d) {
        if (!d.label.trim()) return 'Give it a name.';
        if (U.parseMoney(d.amount) === null) return 'Enter an amount.';
        return null;
      },
      fields: function (d, set) {
        return [
          C.field({
            label: 'Name', value: d.label, focusKey: 'rec-label',
            placeholder: 'Rent, Netflix, wages…',
            onInput: function (e) { set('label', e.target.value); }
          }),
          C.fieldGroup([
            moneyField('Amount', 'amount', d, set),
            C.field({
              label: 'How often', type: 'select', value: d.cadence,
              options: optionsFrom(M.CADENCES),
              onChange: function (e) { set('cadence', e.target.value); }
            })
          ]),
          h('div.field', [
            h('span.field-label', 'Direction'),
            C.chips({
              value: d.kind,
              options: [{ value: 'expense', label: 'Out' }, { value: 'income', label: 'In' }],
              onSelect: function (v) { set('kind', v); }
            })
          ]),
          C.fieldGroup([
            C.field({
              label: 'Category', type: 'select', value: d.category,
              options: M.EXPENSE_CATEGORIES.map(function (c) {
                return { value: c, label: U.humanise(c) };
              }),
              onChange: function (e) { set('category', e.target.value); }
            }),
            C.field({
              label: 'Day of month', type: 'number', min: 1, max: 31,
              value: d.dueDay, hint: 'Optional',
              onInput: function (e) { set('dueDay', e.target.value); }
            })
          ])
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteRecurring(item.id);
        C.toast('Removed', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          label: d.label.trim(),
          kind: d.kind,
          amountPence: pence(d.amount),
          cadence: d.cadence,
          category: d.category,
          dueDay: d.dueDay ? Number(d.dueDay) : null,
          active: d.active
        };
        if (isNew) ctx.actions.addRecurring(fields);
        else ctx.actions.updateRecurring(item.id, fields);
      }
    });
  }

  /* ---------------------------------------------------------------- goal */

  function goalEditor(ctx, goal) {
    const isNew = !goal;
    editor({
      title: isNew ? 'New goal' : 'Edit goal',
      initial: {
        label: goal ? goal.label : '',
        target: goal ? poundsString(goal.targetPence) : '',
        saved: goal ? poundsString(goal.savedPence) : '',
        monthly: goal ? poundsString(goal.monthlyPence) : '',
        targetDate: goal ? goal.targetDate || '' : ''
      },
      validate: function (d) {
        if (!d.label.trim()) return 'Give the goal a name.';
        if (U.parseMoney(d.target) === null) return 'How much do you need?';
        return null;
      },
      fields: function (d, set) {
        return [
          C.field({
            label: 'Goal', value: d.label, focusKey: 'goal-label',
            placeholder: 'Emergency fund, new laptop…',
            onInput: function (e) { set('label', e.target.value); }
          }),
          C.fieldGroup([
            moneyField('Target', 'target', d, set),
            moneyField('Saved so far', 'saved', d, set)
          ]),
          C.fieldGroup([
            moneyField('Per month', 'monthly', d, set, { hint: 'Blank uses your surplus' }),
            C.field({
              label: 'By when', type: 'date', value: d.targetDate, hint: 'Optional',
              onInput: function (e) { set('targetDate', e.target.value); }
            })
          ])
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteGoal(goal.id);
        C.toast('Goal deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          label: d.label.trim(),
          targetPence: pence(d.target),
          savedPence: pence(d.saved),
          monthlyPence: pence(d.monthly),
          targetDate: d.targetDate || null
        };
        if (isNew) ctx.actions.addGoal(fields);
        else ctx.actions.updateGoal(goal.id, fields);
      }
    });
  }

  /* -------------------------------------------------------- application */

  function applicationEditor(ctx, app) {
    const isNew = !app;
    editor({
      title: isNew ? 'New application' : app.company,
      initial: {
        company: app ? app.company : '',
        role: app ? app.role : '',
        status: app ? app.status : 'applied',
        appliedDate: app ? app.appliedDate : ctx.today,
        salary: app ? poundsString(app.salaryPence) : '',
        link: app ? app.link : '',
        source: app ? app.source : '',
        nextAction: app ? app.nextAction : '',
        nextActionDate: app ? app.nextActionDate || '' : '',
        notes: app ? app.notes : ''
      },
      validate: function (d) { return d.company.trim() ? null : 'Who is it with?'; },
      fields: function (d, set) {
        return [
          C.fieldGroup([
            C.field({
              label: 'Company', value: d.company, focusKey: 'app-company',
              onInput: function (e) { set('company', e.target.value); }
            }),
            C.field({
              label: 'Role', value: d.role, placeholder: 'Junior 3D artist',
              onInput: function (e) { set('role', e.target.value); }
            })
          ]),
          C.field({
            label: 'Stage', type: 'select', value: d.status,
            options: optionsFrom(M.APP_STATUSES),
            onChange: function (e) { set('status', e.target.value); }
          }),
          C.fieldGroup([
            C.field({
              label: 'Applied', type: 'date', value: d.appliedDate,
              onInput: function (e) { set('appliedDate', e.target.value); }
            }),
            moneyField('Salary', 'salary', d, set, { hint: 'Yearly, optional' })
          ]),
          C.fieldGroup([
            C.field({
              label: 'Next action', value: d.nextAction, placeholder: 'Chase by email',
              onInput: function (e) { set('nextAction', e.target.value); }
            }),
            C.field({
              label: 'When', type: 'date', value: d.nextActionDate,
              onInput: function (e) { set('nextActionDate', e.target.value); }
            })
          ]),
          C.fieldGroup([
            C.field({
              label: 'Link', type: 'url', value: d.link, placeholder: 'https://',
              onInput: function (e) { set('link', e.target.value); }
            }),
            C.field({
              label: 'Found via', value: d.source, placeholder: 'LinkedIn, referral…',
              onInput: function (e) { set('source', e.target.value); }
            })
          ]),
          C.field({
            label: 'Notes', type: 'textarea', rows: 3, value: d.notes,
            onInput: function (e) { set('notes', e.target.value); }
          })
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteApplication(app.id);
        C.toast('Application deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          company: d.company.trim(),
          role: d.role,
          status: d.status,
          appliedDate: d.appliedDate || ctx.today,
          salaryPence: pence(d.salary),
          link: d.link,
          source: d.source,
          nextAction: d.nextAction,
          nextActionDate: d.nextActionDate || null,
          notes: d.notes
        };
        if (isNew) ctx.actions.addApplication(fields);
        else ctx.actions.updateApplication(app.id, fields);
      }
    });
  }

  /* --------------------------------------------------------------- gig */

  function gigEditor(ctx, gig) {
    const isNew = !gig;
    editor({
      title: isNew ? 'New job' : gig.client,
      initial: {
        client: gig ? gig.client : '',
        title: gig ? gig.title : '',
        status: gig ? gig.status : 'enquiry',
        quoted: gig ? poundsString(gig.quotedPence) : '',
        paid: gig ? poundsString(gig.paidPence) : '',
        startDate: gig ? gig.startDate || '' : '',
        dueDate: gig ? gig.dueDate || '' : '',
        hoursEstimate: gig ? String(gig.hoursEstimate || '') : '',
        hoursLogged: gig ? String(gig.hoursLogged || '') : '',
        notes: gig ? gig.notes : ''
      },
      validate: function (d) { return d.client.trim() ? null : 'Who is the client?'; },
      fields: function (d, set) {
        return [
          C.fieldGroup([
            C.field({
              label: 'Client', value: d.client, focusKey: 'gig-client',
              onInput: function (e) { set('client', e.target.value); }
            }),
            C.field({
              label: 'Job', value: d.title, placeholder: 'Product render',
              onInput: function (e) { set('title', e.target.value); }
            })
          ]),
          C.field({
            label: 'Stage', type: 'select', value: d.status,
            options: optionsFrom(M.GIG_STATUSES),
            onChange: function (e) { set('status', e.target.value); }
          }),
          C.fieldGroup([
            moneyField('Quoted', 'quoted', d, set),
            moneyField('Paid', 'paid', d, set)
          ]),
          C.fieldGroup([
            C.field({
              label: 'Start', type: 'date', value: d.startDate,
              onInput: function (e) { set('startDate', e.target.value); }
            }),
            C.field({
              label: 'Due', type: 'date', value: d.dueDate,
              onInput: function (e) { set('dueDate', e.target.value); }
            })
          ]),
          C.fieldGroup([
            C.field({
              label: 'Hours quoted', type: 'number', step: '0.5', min: 0, value: d.hoursEstimate,
              inputMode: 'decimal',
              onInput: function (e) { set('hoursEstimate', e.target.value); }
            }),
            C.field({
              label: 'Hours spent', type: 'number', step: '0.5', min: 0, value: d.hoursLogged,
              inputMode: 'decimal',
              onInput: function (e) { set('hoursLogged', e.target.value); }
            })
          ]),
          C.field({
            label: 'Notes', type: 'textarea', rows: 3, value: d.notes,
            onInput: function (e) { set('notes', e.target.value); }
          })
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteGig(gig.id);
        C.toast('Job deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          client: d.client.trim(),
          title: d.title,
          status: d.status,
          quotedPence: pence(d.quoted),
          paidPence: pence(d.paid),
          startDate: d.startDate || null,
          dueDate: d.dueDate || null,
          hoursEstimate: Number(d.hoursEstimate) || 0,
          hoursLogged: Number(d.hoursLogged) || 0,
          notes: d.notes
        };
        if (isNew) ctx.actions.addGig(fields);
        else ctx.actions.updateGig(gig.id, fields);
      }
    });
  }

  /* -------------------------------------------------------------- habit */

  function habitEditor(ctx, habit) {
    const isNew = !habit;
    editor({
      title: isNew ? 'New habit' : 'Edit habit',
      initial: {
        name: habit ? habit.name : '',
        emoji: habit ? habit.emoji : '✅',
        cadence: habit ? habit.cadence : 'daily',
        targetPerWeek: habit ? habit.targetPerWeek : 7
      },
      validate: function (d) { return d.name.trim() ? null : 'Name the habit.'; },
      fields: function (d, set) {
        return [
          C.fieldGroup([
            C.field({
              label: 'Icon', value: d.emoji, focusKey: 'habit-emoji',
              class: 'field-narrow',
              onInput: function (e) { set('emoji', e.target.value.slice(0, 3)); }
            }),
            C.field({
              label: 'Habit', value: d.name, placeholder: 'Move for 20 minutes',
              onInput: function (e) { set('name', e.target.value); }
            })
          ]),
          h('div.field', [
            h('span.field-label', 'How often'),
            C.chips({
              value: d.cadence,
              options: [
                { value: 'daily', label: 'Every day' },
                { value: 'weekly', label: 'Some days a week' }
              ],
              onSelect: function (v) {
                set('cadence', v);
                const slot = document.querySelector('.form .target-slot');
                if (slot) K.Dom.mount(slot, targetSlot(d, set));
              }
            })
          ]),
          h('div.target-slot', targetSlot(d, set))
        ];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteHabit(habit.id);
        C.toast('Habit deleted', { actionLabel: 'Undo', onAction: function () { ctx.store.undo(); } });
      },
      onSave: function (d) {
        const fields = {
          name: d.name.trim(),
          emoji: d.emoji || '✅',
          cadence: d.cadence,
          targetPerWeek: d.cadence === 'daily' ? 7 : Number(d.targetPerWeek) || 3
        };
        if (isNew) ctx.actions.addHabit(fields);
        else ctx.actions.updateHabit(habit.id, fields);
      }
    });
  }

  function targetSlot(d, set) {
    if (d.cadence !== 'weekly') return null;
    return h('div.field', [
      h('span.field-label', 'Days a week'),
      C.chips({
        value: d.targetPerWeek,
        options: [1, 2, 3, 4, 5, 6].map(function (n) {
          return { value: n, label: String(n) };
        }),
        onSelect: function (v) {
          set('targetPerWeek', Number(v));
          const slot = document.querySelector('.form .target-slot');
          if (slot) K.Dom.mount(slot, targetSlot(d, set));
        }
      })
    ]);
  }

  /* ------------------------------------------------------------ project */

  function projectEditor(ctx, project) {
    const isNew = !project;
    editor({
      title: isNew ? 'New project' : 'Edit project',
      initial: { name: project ? project.name : '' },
      validate: function (d) { return d.name.trim() ? null : 'Name the project.'; },
      fields: function (d, set) {
        return [C.field({
          label: 'Project', value: d.name, focusKey: 'project-name',
          onInput: function (e) { set('name', e.target.value); }
        })];
      },
      onDelete: isNew ? null : function () {
        ctx.actions.deleteProject(project.id);
        C.toast('Project deleted — its tasks were kept', {
          actionLabel: 'Undo', onAction: function () { ctx.store.undo(); }
        });
      },
      onSave: function (d) {
        if (isNew) ctx.actions.addProject({ name: d.name.trim() });
        else ctx.actions.updateProject(project.id, { name: d.name.trim() });
      }
    });
  }

  K.Forms = {
    editor: editor,
    poundsString: poundsString,
    pence: pence,
    taskEditor: taskEditor,
    transactionEditor: transactionEditor,
    recurringEditor: recurringEditor,
    goalEditor: goalEditor,
    applicationEditor: applicationEditor,
    gigEditor: gigEditor,
    habitEditor: habitEditor,
    projectEditor: projectEditor
  };
})(globalThis.Keel = globalThis.Keel || {});
