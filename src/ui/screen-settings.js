/* Keel — Settings: your data, your thresholds, your way out. */
(function (K) {
  'use strict';

  const h = K.Dom.h, C = K.C, U = K.Util, E = K.Export;

  K.Screens = K.Screens || {};

  K.Screens.settings = {
    render: function (ctx) {
      return [
        profileCard(ctx),
        thresholdsCard(ctx),
        backupCard(ctx),
        obsidianCard(ctx),
        spreadsheetCard(ctx),
        aboutCard(ctx),
        dangerCard(ctx)
      ];
    }
  };

  /* -------------------------------------------------------------- profile */

  function profileCard(ctx) {
    return C.card({ title: 'You' }, [
      C.field({
        label: 'Name', value: ctx.state.profile.name, focusKey: 'profile-name',
        placeholder: 'What should Keel call you?',
        onInput: function (e) { ctx.actions.updateProfile({ name: e.target.value }); }
      })
    ]);
  }

  /* ----------------------------------------------------------- thresholds */

  function thresholdsCard(ctx) {
    const s = ctx.state.settings;
    return C.card({
      title: 'How Keel nudges you',
      subtitle: 'These change when warnings appear, not what is recorded.'
    }, [
      C.field({
        label: 'Warn when runway drops below', type: 'number', min: 1, max: 24,
        value: String(s.runwayWarnMonths), focusKey: 'set-runway',
        hint: 'months',
        onInput: function (e) {
          const v = Number(e.target.value);
          if (v >= 1 && v <= 24) ctx.actions.updateSettings({ runwayWarnMonths: v });
        }
      }),
      C.field({
        label: 'Chase an application after', type: 'number', min: 1, max: 120,
        value: String(s.followUpDays), focusKey: 'set-followup',
        hint: 'days of silence',
        onInput: function (e) {
          const v = Number(e.target.value);
          if (v >= 1 && v <= 120) ctx.actions.updateSettings({ followUpDays: v });
        }
      }),
      h('div.field', [
        h('span.field-label', 'Weekly review day'),
        C.chips({
          value: s.reviewWeekday,
          options: U.DAY_NAMES.map(function (d, i) { return { value: i, label: d }; }),
          onSelect: function (v) {
            ctx.actions.updateSettings({ reviewWeekday: Number(v) });
          }
        })
      ])
    ]);
  }

  /* --------------------------------------------------------------- backup */

  function backupCard(ctx) {
    const st = ctx.state;
    const counts = [
      U.plural(st.money.transactions.length, 'transaction'),
      U.plural(st.tasks.length, 'task'),
      U.plural(Object.keys(st.checkins).length, 'check-in'),
      U.plural(Object.keys(st.journal).length, 'journal entry', 'journal entries')
    ].join(' · ');

    return C.card({
      title: 'Backup',
      subtitle: 'Everything lives in this browser only. Clearing site data wipes it.'
    }, [
      h('p.card-note', counts),
      h('div.button-row', [
        C.button('Save a backup', {
          variant: 'primary',
          onClick: function () {
            download(E.toJSON(st), 'keel-backup-' + ctx.today + '.json', 'application/json');
            C.toast('Backup saved');
          }
        }),
        C.button('Restore', {
          variant: 'ghost',
          onClick: function () { restore(ctx); }
        })
      ]),
      h('p.card-note.card-note-quiet',
        'Restoring replaces everything currently here. Undo in the header will ' +
        'put it back if you change your mind.')
    ]);
  }

  function restore(ctx) {
    const input = h('input', {
      type: 'file', accept: 'application/json,.json',
      style: { display: 'none' }
    });
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const result = E.fromJSON(String(reader.result));
        if (!result.ok) {
          C.toast(result.error, { tone: 'warning', duration: 5000 });
          return;
        }
        const s = result.state;
        C.confirmSheet({
          title: 'Restore this backup?',
          message: 'It holds ' + U.plural(s.money.transactions.length, 'transaction') +
            ', ' + U.plural(s.tasks.length, 'task') + ' and ' +
            U.plural(Object.keys(s.checkins).length, 'check-in') +
            '. Everything currently in Keel will be replaced.',
          confirmLabel: 'Restore',
          onConfirm: function () {
            ctx.store.replace(s, 'restore backup');
            C.toast('Restored');
          }
        });
      };
      reader.onerror = function () { C.toast('Could not read that file', { tone: 'warning' }); };
      reader.readAsText(file);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  /* ------------------------------------------------------------- Obsidian */

  function obsidianCard(ctx) {
    return C.card({
      title: 'Obsidian',
      subtitle: 'Your days and weeks as plain Markdown, with frontmatter.'
    }, [
      h('p.card-note',
        'Exports a folder of notes — one per day, one per week, plus an overview. ' +
        'Unzip it into your vault. Nothing in Keel is locked in.'),
      h('div.button-row', [
        C.button('Export notes (.zip)', {
          variant: 'primary',
          onClick: function () {
            const files = E.obsidianFiles(ctx.state);
            if (!files.length) { C.toast('Nothing to export yet'); return; }
            const bytes = E.zip(files);
            downloadBytes(bytes, 'keel-obsidian-' + ctx.today + '.zip', 'application/zip');
            C.toast(U.plural(files.length, 'note') + ' exported');
          }
        }),
        C.button('Copy today', {
          variant: 'ghost',
          onClick: function () {
            const note = E.dailyNote(ctx.state, ctx.today);
            if (!note) { C.toast('Nothing logged today yet'); return; }
            K.Screens.review.copyText(note, 'Today copied as Markdown');
          }
        })
      ])
    ]);
  }

  /* ---------------------------------------------------------- spreadsheet */

  function spreadsheetCard(ctx) {
    const year = E.currentTaxYear(ctx.today);
    const range = E.taxYearRange(year);
    const prev = E.taxYearRange(year - 1);

    return C.card({
      title: 'Spreadsheets',
      subtitle: 'For self-assessment, or just for a proper look at the numbers.'
    }, [
      h('p.card-note',
        'The UK tax year runs 6 April to 5 April. These cover exactly that.'),
      h('div.button-row', [
        C.button('Transactions ' + range.label, {
          variant: 'ghost',
          onClick: function () {
            download(E.transactionsCSV(ctx.state, range.from, range.to),
              'keel-transactions-' + range.label.replace('/', '-') + '.csv', 'text/csv');
          }
        }),
        C.button('Transactions ' + prev.label, {
          variant: 'ghost',
          onClick: function () {
            download(E.transactionsCSV(ctx.state, prev.from, prev.to),
              'keel-transactions-' + prev.label.replace('/', '-') + '.csv', 'text/csv');
          }
        })
      ]),
      h('div.button-row', [
        C.button('Check-ins', {
          variant: 'ghost',
          onClick: function () {
            download(E.checkinsCSV(ctx.state), 'keel-checkins.csv', 'text/csv');
          }
        }),
        C.button('Habits', {
          variant: 'ghost',
          onClick: function () {
            download(E.habitsCSV(ctx.state), 'keel-habits.csv', 'text/csv');
          }
        })
      ])
    ]);
  }

  /* ---------------------------------------------------------------- about */

  function aboutCard(ctx) {
    const since = ctx.state.createdAt;
    const days = U.daysBetween(since, ctx.today);
    return C.card({ title: 'About' }, [
      h('p.card-note',
        'Keel has been running for ' + U.plural(days === null ? 0 : days, 'day') +
        '. It has no account, no server and no analytics. Nothing you type ' +
        'here leaves this device.'),
      h('p.card-note.card-note-quiet',
        'Patterns are reported as associations, never as causes, and only once ' +
        'there is enough data to mean anything. If Keel is quiet, it is because ' +
        'it does not know yet.'),
      h('div.button-row', [
        C.button('Show the welcome again', {
          variant: 'ghost',
          onClick: function () {
            ctx.actions.updateSettings({ showOnboarding: true });
            ctx.go('#/today');
          }
        })
      ])
    ]);
  }

  /* --------------------------------------------------------------- danger */

  function dangerCard(ctx) {
    return C.card({ title: 'Start over', tone: 'warn' }, [
      h('p.card-note',
        'Wipes everything and returns Keel to a fresh install. Save a backup first.'),
      C.button('Erase everything', {
        variant: 'danger',
        onClick: function () {
          C.confirmSheet({
            title: 'Erase everything?',
            message: 'Every transaction, task, habit, check-in and journal entry ' +
              'will be removed. If you have not saved a backup, this cannot be recovered ' +
              'once you close the app.',
            confirmLabel: 'Erase',
            danger: true,
            onConfirm: function () {
              ctx.store.reset();
              ctx.go('#/today');
              C.toast('Keel reset', {
                actionLabel: 'Undo', onAction: function () { ctx.store.undo(); }
              });
            }
          });
        }
      })
    ]);
  }

  /* ------------------------------------------------------------ downloads */

  function download(text, filename, mime) {
    downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), filename);
  }

  function downloadBytes(bytes, filename, mime) {
    downloadBlob(new Blob([bytes], { type: mime }), filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 4000);
  }
})(globalThis.Keel = globalThis.Keel || {});
