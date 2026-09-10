/* Keel — data model: shape, defaults, normalisation, migrations. */
(function (K) {
  'use strict';

  const U = K.Util;

  const SCHEMA_VERSION = 1;

  /* Enumerations. Kept as plain arrays so the UI can render pickers from
     the same source of truth the validator uses. */

  const APP_STATUSES = [
    { id: 'lead', label: 'Lead', weight: 0.05, open: true },
    { id: 'applied', label: 'Applied', weight: 0.10, open: true },
    { id: 'screening', label: 'Screening', weight: 0.25, open: true },
    { id: 'interview', label: 'Interview', weight: 0.45, open: true },
    { id: 'final', label: 'Final stage', weight: 0.65, open: true },
    { id: 'offer', label: 'Offer', weight: 0.90, open: true },
    { id: 'accepted', label: 'Accepted', weight: 1, open: false },
    { id: 'rejected', label: 'Rejected', weight: 0, open: false },
    { id: 'withdrawn', label: 'Withdrawn', weight: 0, open: false }
  ];

  const GIG_STATUSES = [
    { id: 'enquiry', label: 'Enquiry', weight: 0.2, open: true },
    { id: 'quoted', label: 'Quoted', weight: 0.4, open: true },
    { id: 'booked', label: 'Booked', weight: 0.9, open: true },
    { id: 'in_progress', label: 'In progress', weight: 1, open: true },
    { id: 'delivered', label: 'Delivered', weight: 1, open: true },
    { id: 'paid', label: 'Paid', weight: 1, open: false },
    { id: 'lost', label: 'Lost', weight: 0, open: false }
  ];

  const CADENCES = [
    { id: 'weekly', label: 'Weekly', perYear: 52 },
    { id: 'fortnightly', label: 'Fortnightly', perYear: 26 },
    { id: 'four_weekly', label: 'Every 4 weeks', perYear: 13 },
    { id: 'monthly', label: 'Monthly', perYear: 12 },
    { id: 'quarterly', label: 'Quarterly', perYear: 4 },
    { id: 'annual', label: 'Annual', perYear: 1 }
  ];

  const STREAMS = [
    { id: 'ebay', label: 'eBay / reselling' },
    { id: 'freelance', label: 'Freelance / creative' },
    { id: 'employment', label: 'Employment' },
    { id: 'other', label: 'Other' }
  ];

  const EXPENSE_CATEGORIES = [
    'rent', 'bills', 'food', 'transport', 'stock', 'tools', 'subscriptions',
    'health', 'social', 'gifts', 'debt', 'other'
  ];

  const PRIORITIES = [
    { id: 3, label: 'High' },
    { id: 2, label: 'Normal' },
    { id: 1, label: 'Low' }
  ];

  function statusMeta(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function cadencePerYear(id) {
    const c = statusMeta(CADENCES, id);
    return c ? c.perYear : 12;
  }

  /* ------------------------------------------------------------ defaults */

  function defaultState(now) {
    const t = U.today(now);
    return {
      version: SCHEMA_VERSION,
      createdAt: t,
      profile: { name: '', currencySymbol: '£' },
      settings: {
        runwayWarnMonths: 3,
        followUpDays: 10,        // chase an application after this long silent
        reviewWeekday: 6,        // 0=Mon .. 6=Sun
        showOnboarding: true
      },
      money: {
        cashPence: 0,
        cashUpdated: null,
        recurring: [],
        transactions: [],
        goals: []
      },
      applications: [],
      gigs: [],
      habits: [],
      habitLog: {},
      checkins: {},
      projects: [],
      tasks: [],
      journal: {},
      focus: {},
      reviews: []
    };
  }

  /* Seed content: enough that the app is legible on first open, and every
     item is obviously a suggestion the user can delete. */
  function seedState(now) {
    const s = defaultState(now);
    const t = U.today(now);
    s.habits = [
      habit({ name: 'Move for 20 min', emoji: '🏃', cadence: 'daily', order: 0 }),
      habit({ name: 'List an item', emoji: '📦', cadence: 'weekly', targetPerWeek: 5, order: 1 }),
      habit({ name: 'Deep work block', emoji: '🎯', cadence: 'daily', order: 2 }),
      habit({ name: 'No screens after 11', emoji: '🌙', cadence: 'daily', order: 3 })
    ];
    s.projects = [
      project({ name: 'Reselling', color: 'amber' }),
      project({ name: 'Freelance', color: 'violet' }),
      project({ name: 'Job hunt', color: 'blue' }),
      project({ name: 'Life admin', color: 'slate' })
    ];
    s.settings.showOnboarding = true;
    s.createdAt = t;
    return s;
  }

  /* ------------------------------------------------------- item factories */

  function num(v, fallback) {
    const n = Number(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  function str(v, fallback) {
    return typeof v === 'string' ? v : (fallback === undefined ? '' : fallback);
  }

  function bool(v, fallback) {
    return typeof v === 'boolean' ? v : !!fallback;
  }

  function oneOf(v, list, fallback) {
    return list.indexOf(v) >= 0 ? v : fallback;
  }

  function isoOrNull(v) { return U.isISODate(v) ? v : null; }

  function habit(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('hab'),
      name: str(o.name, 'Habit'),
      emoji: str(o.emoji, '✅'),
      cadence: oneOf(o.cadence, ['daily', 'weekly'], 'daily'),
      targetPerWeek: U.clamp(num(o.targetPerWeek, 7), 1, 7),
      archived: bool(o.archived),
      createdAt: isoOrNull(o.createdAt) || U.today(),
      order: num(o.order, 0)
    };
  }

  function project(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('prj'),
      name: str(o.name, 'Project'),
      color: str(o.color, 'slate'),
      archived: bool(o.archived)
    };
  }

  function task(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('tsk'),
      title: str(o.title, 'Task'),
      projectId: str(o.projectId) || null,
      done: bool(o.done),
      doneDate: isoOrNull(o.doneDate),
      dueDate: isoOrNull(o.dueDate),
      priority: U.clamp(Math.round(num(o.priority, 2)), 1, 3),
      someday: bool(o.someday),
      notes: str(o.notes),
      createdAt: isoOrNull(o.createdAt) || U.today()
    };
  }

  function recurring(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('rec'),
      label: str(o.label, 'Item'),
      kind: oneOf(o.kind, ['income', 'expense'], 'expense'),
      category: str(o.category, 'other'),
      stream: o.stream ? str(o.stream) : null,
      amountPence: Math.round(num(o.amountPence, 0)),
      cadence: oneOf(o.cadence, CADENCES.map(function (c) { return c.id; }), 'monthly'),
      dueDay: o.dueDay ? U.clamp(Math.round(num(o.dueDay, 1)), 1, 31) : null,
      active: o.active === undefined ? true : bool(o.active, true),
      notes: str(o.notes)
    };
  }

  function transaction(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('txn'),
      date: isoOrNull(o.date) || U.today(),
      label: str(o.label, 'Transaction'),
      kind: oneOf(o.kind, ['income', 'expense'], 'expense'),
      category: str(o.category, 'other'),
      stream: o.stream ? str(o.stream) : null,
      amountPence: Math.abs(Math.round(num(o.amountPence, 0))),
      notes: str(o.notes)
    };
  }

  function goal(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('gol'),
      label: str(o.label, 'Goal'),
      targetPence: Math.max(0, Math.round(num(o.targetPence, 0))),
      savedPence: Math.max(0, Math.round(num(o.savedPence, 0))),
      targetDate: isoOrNull(o.targetDate),
      monthlyPence: Math.max(0, Math.round(num(o.monthlyPence, 0))),
      archived: bool(o.archived),
      notes: str(o.notes)
    };
  }

  function application(o) {
    o = o || {};
    const statusIds = APP_STATUSES.map(function (s) { return s.id; });
    return {
      id: str(o.id) || U.uid('app'),
      company: str(o.company, 'Company'),
      role: str(o.role),
      status: oneOf(o.status, statusIds, 'applied'),
      appliedDate: isoOrNull(o.appliedDate) || U.today(),
      lastContact: isoOrNull(o.lastContact),
      nextAction: str(o.nextAction),
      nextActionDate: isoOrNull(o.nextActionDate),
      salaryPence: Math.max(0, Math.round(num(o.salaryPence, 0))),
      link: str(o.link),
      source: str(o.source),
      notes: str(o.notes),
      updatedAt: isoOrNull(o.updatedAt) || U.today()
    };
  }

  function gig(o) {
    o = o || {};
    const statusIds = GIG_STATUSES.map(function (s) { return s.id; });
    return {
      id: str(o.id) || U.uid('gig'),
      client: str(o.client, 'Client'),
      title: str(o.title),
      status: oneOf(o.status, statusIds, 'enquiry'),
      quotedPence: Math.max(0, Math.round(num(o.quotedPence, 0))),
      paidPence: Math.max(0, Math.round(num(o.paidPence, 0))),
      startDate: isoOrNull(o.startDate),
      dueDate: isoOrNull(o.dueDate),
      hoursEstimate: Math.max(0, num(o.hoursEstimate, 0)),
      hoursLogged: Math.max(0, num(o.hoursLogged, 0)),
      notes: str(o.notes),
      updatedAt: isoOrNull(o.updatedAt) || U.today()
    };
  }

  function checkin(o) {
    o = o || {};
    function orNull(v, lo, hi) {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return isFinite(n) ? U.clamp(n, lo, hi) : null;
    }
    return {
      sleepHours: orNull(o.sleepHours, 0, 24),
      energy: orNull(o.energy, 1, 5),
      mood: orNull(o.mood, 1, 5),
      exerciseMins: orNull(o.exerciseMins, 0, 1440),
      weightKg: orNull(o.weightKg, 0, 500),
      water: orNull(o.water, 0, 30),
      note: str(o.note)
    };
  }

  function journalEntry(o) {
    o = o || {};
    return {
      text: str(o.text),
      win: str(o.win),
      grateful: str(o.grateful),
      lesson: str(o.lesson),
      updatedAt: str(o.updatedAt) || new Date().toISOString()
    };
  }

  function review(o) {
    o = o || {};
    return {
      id: str(o.id) || U.uid('rev'),
      weekKey: str(o.weekKey),
      createdAt: str(o.createdAt) || new Date().toISOString(),
      wins: str(o.wins),
      improve: str(o.improve),
      nextWeek: str(o.nextWeek),
      ratings: (o.ratings && typeof o.ratings === 'object') ? o.ratings : {}
    };
  }

  /* -------------------------------------------------------- normalisation */
  /* Anything reaching this function may be corrupt, hand-edited, or from an
     older build. It must always produce a state the UI can render. */

  function normalise(raw, now) {
    const base = defaultState(now);
    if (!raw || typeof raw !== 'object') return base;

    const s = base;
    s.version = SCHEMA_VERSION;
    s.createdAt = isoOrNull(raw.createdAt) || base.createdAt;

    if (raw.profile && typeof raw.profile === 'object') {
      s.profile.name = str(raw.profile.name);
      s.profile.currencySymbol = str(raw.profile.currencySymbol, '£') || '£';
    }
    if (raw.settings && typeof raw.settings === 'object') {
      s.settings.runwayWarnMonths = U.clamp(num(raw.settings.runwayWarnMonths, 3), 1, 24);
      s.settings.followUpDays = U.clamp(num(raw.settings.followUpDays, 10), 1, 120);
      s.settings.reviewWeekday = U.clamp(Math.round(num(raw.settings.reviewWeekday, 6)), 0, 6);
      s.settings.showOnboarding = bool(raw.settings.showOnboarding, false);
    }

    const m = raw.money && typeof raw.money === 'object' ? raw.money : {};
    s.money.cashPence = Math.round(num(m.cashPence, 0));
    s.money.cashUpdated = isoOrNull(m.cashUpdated);
    s.money.recurring = arr(m.recurring).map(recurring);
    s.money.transactions = arr(m.transactions).map(transaction);
    s.money.goals = arr(m.goals).map(goal);

    s.applications = arr(raw.applications).map(application);
    s.gigs = arr(raw.gigs).map(gig);
    s.habits = arr(raw.habits).map(habit);
    s.projects = arr(raw.projects).map(project);
    s.tasks = arr(raw.tasks).map(task);
    s.reviews = arr(raw.reviews).map(review);

    // Date-keyed maps: drop any key that is not a real calendar day, so a
    // corrupt key can never leak into a date loop.
    s.habitLog = mapByDate(raw.habitLog, function (v) {
      const out = {};
      if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (k) { if (v[k]) out[k] = true; });
      }
      return Object.keys(out).length ? out : null;
    });
    s.checkins = mapByDate(raw.checkins, function (v) {
      const c = checkin(v);
      const empty = c.sleepHours === null && c.energy === null && c.mood === null &&
        c.exerciseMins === null && c.weightKg === null && c.water === null && !c.note;
      return empty ? null : c;
    });
    s.journal = mapByDate(raw.journal, function (v) {
      const j = journalEntry(v);
      return (j.text || j.win || j.grateful || j.lesson) ? j : null;
    });
    s.focus = mapByDate(raw.focus, function (v) {
      if (!v || typeof v !== 'object') return null;
      const f = { text: str(v.text), done: bool(v.done) };
      return f.text ? f : null;
    });

    // Drop task links to projects that no longer exist.
    const projectIds = {};
    s.projects.forEach(function (p) { projectIds[p.id] = true; });
    s.tasks.forEach(function (t) {
      if (t.projectId && !projectIds[t.projectId]) t.projectId = null;
    });

    // Drop habit ticks for habits that no longer exist.
    const habitIds = {};
    s.habits.forEach(function (h) { habitIds[h.id] = true; });
    Object.keys(s.habitLog).forEach(function (day) {
      const kept = {};
      Object.keys(s.habitLog[day]).forEach(function (hid) {
        if (habitIds[hid]) kept[hid] = true;
      });
      if (Object.keys(kept).length) s.habitLog[day] = kept;
      else delete s.habitLog[day];
    });

    return s;
  }

  function arr(v) { return Array.isArray(v) ? v : []; }

  function mapByDate(raw, fn) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      if (!U.isISODate(k)) return;
      const v = fn(raw[k]);
      if (v !== null && v !== undefined) out[k] = v;
    });
    return out;
  }

  /* ---------------------------------------------------------- migrations */
  /* Each migration takes the previous shape and returns the next one. New
     versions append here; normalise() then fills anything still missing. */

  const MIGRATIONS = {
    // 0 -> 1: pre-release states had no version field at all.
    0: function (s) { s.version = 1; return s; }
  };

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    let s = raw;
    let v = Number(s.version) || 0;
    let guard = 0;
    while (v < SCHEMA_VERSION && guard++ < 50) {
      const step = MIGRATIONS[v];
      if (!step) break;
      s = step(s) || s;
      v = Number(s.version) || v + 1;
    }
    return s;
  }

  K.Model = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    APP_STATUSES: APP_STATUSES,
    GIG_STATUSES: GIG_STATUSES,
    CADENCES: CADENCES,
    STREAMS: STREAMS,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    PRIORITIES: PRIORITIES,
    statusMeta: statusMeta,
    cadencePerYear: cadencePerYear,
    defaultState: defaultState,
    seedState: seedState,
    normalise: normalise,
    migrate: migrate,
    habit: habit,
    project: project,
    task: task,
    recurring: recurring,
    transaction: transaction,
    goal: goal,
    application: application,
    gig: gig,
    checkin: checkin,
    journalEntry: journalEntry,
    review: review
  };
})(globalThis.Keel = globalThis.Keel || {});
