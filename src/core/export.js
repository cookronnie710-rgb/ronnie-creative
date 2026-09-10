/* Keel — export and import: JSON backup, Obsidian notes, CSV, ZIP.
   Pure logic: produces strings and byte arrays, never touches the DOM. */
(function (K) {
  'use strict';

  const U = K.Util, M = K.Model, Money = K.Money, Habits = K.Habits,
    Health = K.Health, Review = K.Review, Work = K.Work, Tasks = K.Tasks;

  // Prefer the model's own label ('eBay / reselling') over title-casing the
  // id, which would render 'ebay' as 'Ebay'.
  function streamLabel(id) {
    if (!id) return '';
    const meta = M.statusMeta(M.STREAMS, id);
    return meta ? meta.label : U.humanise(id);
  }

  /* ---------------------------------------------------------- JSON backup */

  function toJSON(state) {
    return JSON.stringify({
      app: 'keel',
      version: M.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: state
    }, null, 2);
  }

  // Accepts both a wrapped export and a bare state object, so a backup
  // that has been through someone's text editor still restores.
  function fromJSON(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'That file does not contain a backup.' };
    }
    const body = (raw.state && typeof raw.state === 'object') ? raw.state : raw;
    const looksLikeState = ['money', 'habits', 'tasks', 'applications', 'checkins']
      .some(function (k) { return body[k] !== undefined; });
    if (!looksLikeState) {
      return { ok: false, error: 'That file does not look like a Keel backup.' };
    }
    try {
      return { ok: true, state: M.normalise(M.migrate(body)) };
    } catch (e) {
      return { ok: false, error: 'The backup could not be read: ' + e.message };
    }
  }

  /* ------------------------------------------------------------------ CSV */

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    // Numbers go through untouched — the injection guard below must never
    // turn -23.4 into a text cell, or every spreadsheet total breaks.
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    const s = String(v);
    // Guard against spreadsheet formula injection from free-text fields.
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }

  function csvRows(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  // The UK tax year runs 6 April to 5 April. `startYear` 2026 means 2026/27.
  function taxYearRange(startYear) {
    return {
      from: startYear + '-04-06',
      to: (startYear + 1) + '-04-05',
      label: startYear + '/' + String(startYear + 1).slice(2)
    };
  }

  function currentTaxYear(refISO) {
    const ref = refISO || U.today();
    const y = Number(String(ref).slice(0, 4));
    return ref >= (y + '-04-06') ? y : y - 1;
  }

  function transactionsCSV(state, fromISO, toISO) {
    const rows = [['Date', 'Type', 'Label', 'Category', 'Stream', 'Amount (GBP)', 'Notes']];
    U.sortBy(Money.transactionsIn(state, fromISO, toISO), function (t) { return t.date; })
      .forEach(function (t) {
        rows.push([
          t.date,
          t.kind === 'income' ? 'Income' : 'Expense',
          t.label,
          t.kind === 'income' ? '' : U.humanise(t.category),
          streamLabel(t.stream),
          (t.kind === 'income' ? 1 : -1) * U.toPounds(t.amountPence),
          t.notes
        ]);
      });
    return csvRows(rows);
  }

  function checkinsCSV(state) {
    const rows = [['Date', 'Sleep (h)', 'Energy', 'Mood', 'Movement (min)', 'Water', 'Weight (kg)', 'Note']];
    Object.keys(state.checkins).sort().forEach(function (d) {
      const c = state.checkins[d];
      rows.push([d, c.sleepHours, c.energy, c.mood, c.exerciseMins, c.water, c.weightKg, c.note]);
    });
    return csvRows(rows);
  }

  function habitsCSV(state) {
    const habits = state.habits;
    const rows = [['Date'].concat(habits.map(function (h) { return h.name; }))];
    Object.keys(state.habitLog).sort().forEach(function (d) {
      rows.push([d].concat(habits.map(function (h) {
        return state.habitLog[d][h.id] ? 1 : 0;
      })));
    });
    return csvRows(rows);
  }

  /* ------------------------------------------------------- Obsidian notes */

  function yamlValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const s = String(v);
    return /[:#\-{}\[\]&*!|>'"%@`,\n]/.test(s) ? JSON.stringify(s) : s;
  }

  function frontmatter(obj) {
    const lines = ['---'];
    Object.keys(obj).forEach(function (k) {
      const v = obj[k];
      if (v === null || v === undefined || v === '') return;
      if (Array.isArray(v)) {
        if (!v.length) return;
        lines.push(k + ': [' + v.map(yamlValue).join(', ') + ']');
      } else {
        lines.push(k + ': ' + yamlValue(v));
      }
    });
    lines.push('---', '');
    return lines.join('\n');
  }

  function dailyNote(state, day) {
    const c = state.checkins[day];
    const j = state.journal[day];
    const f = state.focus[day];
    const ticks = state.habitLog[day] || {};
    const habitNames = state.habits.filter(function (h) { return ticks[h.id]; })
      .map(function (h) { return h.name; });
    const done = Tasks.completedIn(state, day, day);
    const txns = Money.transactionsIn(state, day, day);

    if (!c && !j && !f && !habitNames.length && !done.length && !txns.length) return null;

    const fm = { date: day, type: 'daily' };
    if (c) {
      if (c.sleepHours !== null) fm.sleep = c.sleepHours;
      if (c.energy !== null) fm.energy = c.energy;
      if (c.mood !== null) fm.mood = c.mood;
      if (c.exerciseMins !== null) fm.movement = c.exerciseMins;
      if (c.weightKg !== null) fm.weight = c.weightKg;
    }
    if (habitNames.length) fm.habits = habitNames;

    const body = [frontmatter(fm), '# ' + U.formatDate(day, 'long'), ''];

    if (f && f.text) {
      body.push('## Focus', (f.done ? '- [x] ' : '- [ ] ') + f.text, '');
    }
    if (habitNames.length) {
      body.push('## Habits');
      state.habits.filter(function (h) { return !h.archived; }).forEach(function (h) {
        body.push((ticks[h.id] ? '- [x] ' : '- [ ] ') + h.emoji + ' ' + h.name);
      });
      body.push('');
    }
    if (c) {
      const bits = [];
      if (c.sleepHours !== null) bits.push('Sleep **' + c.sleepHours + 'h**');
      if (c.energy !== null) bits.push('Energy **' + c.energy + '/5**');
      if (c.mood !== null) bits.push('Mood **' + c.mood + '/5**');
      if (c.exerciseMins !== null) bits.push('Movement **' + c.exerciseMins + ' min**');
      if (c.water !== null) bits.push('Water **' + c.water + '**');
      if (c.weightKg !== null) bits.push('Weight **' + c.weightKg + ' kg**');
      if (bits.length) body.push('## Check-in', bits.join(' · '), '');
      if (c.note) body.push(c.note, '');
    }
    if (done.length) {
      body.push('## Done');
      done.forEach(function (t) { body.push('- [x] ' + t.title); });
      body.push('');
    }
    if (txns.length) {
      body.push('## Money');
      txns.forEach(function (t) {
        // Income is meaningful by stream, spending by category.
        const tag = t.kind === 'income' ? streamLabel(t.stream) : U.humanise(t.category);
        body.push('- ' + (t.kind === 'income' ? '+' : '−') + U.formatMoney(t.amountPence) +
          ' — ' + t.label + (tag ? ' _(' + tag + ')_' : ''));
      });
      body.push('');
    }
    if (j) {
      body.push('## Journal');
      if (j.win) body.push('**Win.** ' + j.win, '');
      if (j.grateful) body.push('**Grateful for.** ' + j.grateful, '');
      if (j.lesson) body.push('**Lesson.** ' + j.lesson, '');
      if (j.text) body.push(j.text, '');
    }

    return body.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function weeklyNote(state, weekStart) {
    const d = Review.fullDigest(state, weekStart, U.today());
    const saved = Review.savedReview(state, d.period.key);
    const fm = { week: d.period.key, type: 'weekly', from: d.period.start, to: d.period.end };
    if (d.scores.overall !== null) fm.score = d.scores.overall;

    const b = [frontmatter(fm), '# Week ' + d.period.key + ' — ' + d.period.label, ''];

    if (d.scores.overall !== null) {
      b.push('**Overall ' + d.scores.overall + '/100** across ' +
        U.plural(d.scores.domainsScored, 'scored area') + '.', '');
    }

    b.push('## Habits');
    if (d.habits.count) {
      b.push('' + d.habits.done + ' of ' + d.habits.target + ' (' +
        (d.habits.pct === null ? '—' : Math.round(d.habits.pct) + '%') + ')', '');
      d.habits.perHabit.forEach(function (p) {
        b.push('- ' + (p.met ? '✅' : '⬜') + ' **' + p.habit.name + '** ' +
          p.done + '/' + p.target + (p.streak ? ' · streak ' + p.streak : ''));
      });
    } else b.push('_No habits set up._');
    b.push('');

    b.push('## Tasks',
      d.tasks.completed + ' completed (' + (d.tasks.delta >= 0 ? '+' : '') + d.tasks.delta +
      ' on the week before), ' + d.tasks.added + ' added, ' + d.tasks.overdueNow + ' overdue now.', '');
    d.tasks.completedList.slice(0, 20).forEach(function (t) { b.push('- [x] ' + t.title); });
    b.push('');

    b.push('## Money');
    if (d.money.count) {
      b.push('In **' + U.formatMoney(d.money.incomePence) + '**, out **' +
        U.formatMoney(d.money.expensePence) + '**, net **' +
        U.formatMoney(d.money.netPence, { plus: true }) + '**.', '');
      d.money.topCategories.forEach(function (c) {
        b.push('- ' + U.humanise(c.category) + ' — ' + U.formatMoney(c.pence));
      });
    } else b.push('_Nothing logged._');
    b.push('');

    b.push('## Work',
      d.work.applicationsSent + ' applications sent, ' + d.work.applicationsMoved +
      ' moved stage, ' + d.work.gigsWon + ' jobs won, ' + d.work.gigsPaid + ' paid.' +
      (d.work.followUps ? ' ' + U.plural(d.work.followUps, 'follow-up') + ' outstanding.' : ''), '');

    b.push('## Health');
    const h = d.health;
    const hb = [];
    if (h.sleep) hb.push('Sleep **' + U.round(h.sleep.value, 1) + 'h**');
    if (h.energy) hb.push('Energy **' + U.round(h.energy.value, 1) + '/5**');
    if (h.mood) hb.push('Mood **' + U.round(h.mood.value, 1) + '/5**');
    hb.push('Moved on **' + h.moveDays + '** of ' + h.possibleDays + ' days');
    b.push(hb.join(' · '), '');

    if (d.journal.wins.length) {
      b.push('## Wins');
      d.journal.wins.forEach(function (w) {
        b.push('- ' + w.text + ' _(' + U.formatDate(w.date, 'short') + ')_');
      });
      b.push('');
    }
    if (d.journal.lessons.length) {
      b.push('## Lessons');
      d.journal.lessons.forEach(function (l) {
        b.push('- ' + l.text + ' _(' + U.formatDate(l.date, 'short') + ')_');
      });
      b.push('');
    }
    if (d.insights.length) {
      b.push('## Noticed');
      d.insights.forEach(function (i) { b.push('- **' + i.title + '** — ' + i.detail); });
      b.push('');
    }
    if (saved) {
      b.push('## Review');
      if (saved.wins) b.push('**Went well.** ' + saved.wins, '');
      if (saved.improve) b.push('**Do differently.** ' + saved.improve, '');
      if (saved.nextWeek) b.push('**Next week.** ' + saved.nextWeek, '');
    }

    return b.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function overviewNote(state) {
    const r = Money.runway(state);
    const b = [frontmatter({ type: 'overview', generated: U.today() }), '# Keel overview', ''];
    b.push('## Money',
      'Cash **' + U.formatMoney(state.money.cashPence) + '**' +
      (r.months !== null ? ' · runway **' + r.months + ' months**' : '') +
      ' · monthly net **' + U.formatMoney(r.netPence, { plus: true }) + '** _(' + r.basis + ')_', '');

    const pv = Work.pipelineValue(state);
    b.push('## Work',
      U.plural(pv.applications.count, 'open application') + ' · expected **' +
      U.formatMoney(pv.applications.expectedPence) + '**', '',
      U.plural(pv.gigs.count, 'open job') + ' · expected **' +
      U.formatMoney(pv.gigs.expectedPence) + '**', '');

    b.push('## Habits');
    Habits.activeHabits(state).forEach(function (h) {
      const st = Habits.streak(state, h);
      const rate = Habits.completionRate(state, h, 30);
      b.push('- **' + h.name + '** · streak ' + st.current + ' ' + st.unit +
        (st.current === 1 ? '' : 's') +
        (rate.pct !== null ? ' · ' + Math.round(rate.pct) + '% over 30 days' : ''));
    });
    b.push('');

    b.push('## Open tasks');
    Tasks.active(state).slice(0, 40).forEach(function (t) {
      b.push('- [ ] ' + t.title + (t.dueDate ? ' _(due ' + U.formatDate(t.dueDate, 'short') + ')_' : ''));
    });

    return b.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // A vault-shaped set of notes: Daily/YYYY-MM-DD.md, Weekly/YYYY-Www.md.
  function obsidianFiles(state) {
    const files = [{ path: 'Keel/Overview.md', content: overviewNote(state) }];

    const days = {};
    [state.checkins, state.journal, state.focus, state.habitLog].forEach(function (map) {
      Object.keys(map).forEach(function (d) { days[d] = true; });
    });
    state.money.transactions.forEach(function (t) { days[t.date] = true; });
    state.tasks.forEach(function (t) { if (t.doneDate) days[t.doneDate] = true; });

    Object.keys(days).sort().forEach(function (d) {
      const note = dailyNote(state, d);
      if (note) files.push({ path: 'Keel/Daily/' + d + '.md', content: note });
    });

    Review.weeksWithData(state, 52).forEach(function (w) {
      files.push({ path: 'Keel/Weekly/' + w.key + '.md', content: weeklyNote(state, w.start) });
    });

    return files;
  }

  /* -------------------------------------------------------------- ZIP out */
  /* Store-only (no compression) so this stays dependency-free. Markdown
     zips poorly enough that the size difference does not justify shipping
     a deflate implementation. */

  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    CRC_TABLE = t;
    return t;
  }

  function crc32(bytes) {
    const t = crcTable();
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // Fallback for environments without TextEncoder.
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  function zip(files, when) {
    const now = when || new Date();
    const time = dosTime(now), date = dosDate(now);
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(function (f) {
      const name = utf8(f.path);
      const data = utf8(f.content);
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);        // version needed
      lv.setUint16(6, 0x0800, true);    // UTF-8 filename flag
      lv.setUint16(8, 0, true);         // stored
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);

      chunks.push(local, data);

      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);        // version made by
      cv.setUint16(6, 20, true);        // version needed
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);
      central.push(cen);

      offset += local.length + data.length;
    });

    const centralSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const all = chunks.concat(central, [end]);
    const total = all.reduce(function (n, c) { return n + c.length; }, 0);
    const out = new Uint8Array(total);
    let p = 0;
    all.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  K.Export = {
    toJSON: toJSON,
    fromJSON: fromJSON,
    csvRows: csvRows,
    streamLabel: streamLabel,
    taxYearRange: taxYearRange,
    currentTaxYear: currentTaxYear,
    transactionsCSV: transactionsCSV,
    checkinsCSV: checkinsCSV,
    habitsCSV: habitsCSV,
    dailyNote: dailyNote,
    weeklyNote: weeklyNote,
    overviewNote: overviewNote,
    obsidianFiles: obsidianFiles,
    crc32: crc32,
    zip: zip
  };
})(globalThis.Keel = globalThis.Keel || {});
