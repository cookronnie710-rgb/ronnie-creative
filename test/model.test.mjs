import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M } = core();

test('normalise survives anything at all', () => {
  for (const junk of [null, undefined, 0, '', 'string', [], true, { random: 'keys' }]) {
    const s = M.normalise(junk);
    assert.equal(typeof s, 'object');
    assert.ok(Array.isArray(s.tasks));
    assert.ok(Array.isArray(s.money.transactions));
    assert.equal(s.version, M.SCHEMA_VERSION);
  }
});

test('date-keyed maps drop keys that are not real days', () => {
  const s = M.normalise({
    checkins: {
      '2026-09-10': { sleepHours: 7 },
      'not-a-date': { sleepHours: 7 },
      '2026-13-45': { sleepHours: 7 },
      '': { sleepHours: 7 }
    }
  });
  assert.deepEqual(Object.keys(s.checkins), ['2026-09-10'],
    'a bad key must never reach a date loop');
});

test('empty check-ins and journal entries are not stored', () => {
  const s = M.normalise({
    checkins: { '2026-09-10': {}, '2026-09-11': { mood: 3 } },
    journal: { '2026-09-10': { text: '' }, '2026-09-11': { win: 'listed 3 items' } }
  });
  assert.deepEqual(Object.keys(s.checkins), ['2026-09-11']);
  assert.deepEqual(Object.keys(s.journal), ['2026-09-11']);
});

test('orphaned references are cleaned up rather than left dangling', () => {
  const s = M.normalise({
    projects: [{ id: 'p1', name: 'Real' }],
    tasks: [
      { id: 't1', title: 'Kept', projectId: 'p1' },
      { id: 't2', title: 'Orphan', projectId: 'gone' }
    ],
    habits: [{ id: 'h1', name: 'Real habit' }],
    habitLog: {
      '2026-09-10': { h1: true, ghost: true },
      '2026-09-09': { ghost: true }
    }
  });
  assert.equal(s.tasks[1].projectId, null, 'a task outlives its project');
  assert.deepEqual(s.habitLog['2026-09-10'], { h1: true });
  assert.equal(s.habitLog['2026-09-09'], undefined,
    'a day with only ghost ticks should disappear entirely');
});

test('values are clamped into their legal range', () => {
  const c = M.checkin({ energy: 99, mood: -4, sleepHours: 400, water: 'abc' });
  assert.equal(c.energy, 5);
  assert.equal(c.mood, 1);
  assert.equal(c.sleepHours, 24);
  assert.equal(c.water, null, 'unparseable means unknown, not zero');

  const t = M.task({ priority: 99 });
  assert.equal(t.priority, 3);
});

test('unknown enum values fall back instead of corrupting the state', () => {
  assert.equal(M.application({ status: 'invented' }).status, 'applied');
  assert.equal(M.gig({ status: 'invented' }).status, 'enquiry');
  assert.equal(M.recurring({ cadence: 'hourly' }).cadence, 'monthly');
  assert.equal(M.habit({ cadence: 'yearly' }).cadence, 'daily');
});

test('amounts are stored as whole pence and never negative where they must not be', () => {
  assert.equal(M.transaction({ amountPence: -500 }).amountPence, 500,
    'direction is carried by kind, not by sign');
  assert.equal(M.transaction({ amountPence: 12.7 }).amountPence, 13);
  assert.equal(M.goal({ savedPence: -100 }).savedPence, 0);
});

test('a version-less state migrates without losing anything', () => {
  const legacy = {
    money: { cashPence: 1234, transactions: [{ label: 'Old', amountPence: 500, date: '2026-01-01' }] },
    tasks: [{ title: 'Legacy task' }]
  };
  const s = M.normalise(M.migrate(legacy));
  assert.equal(s.version, M.SCHEMA_VERSION);
  assert.equal(s.money.cashPence, 1234);
  assert.equal(s.money.transactions.length, 1);
  assert.equal(s.tasks[0].title, 'Legacy task');
});

test('a fresh install has habits and projects but no invented money', () => {
  const s = M.seedState();
  assert.ok(s.habits.length > 0, 'examples give a new user somewhere to start');
  assert.ok(s.projects.length > 0);
  assert.equal(s.money.transactions.length, 0);
  assert.equal(s.money.cashPence, 0);
  assert.equal(s.money.recurring.length, 0,
    'zero-value placeholders made Keel claim it knew your finances');
  assert.equal(s.settings.showOnboarding, true);
});

test('normalising is idempotent', () => {
  const once = M.normalise(M.seedState());
  const twice = M.normalise(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});
