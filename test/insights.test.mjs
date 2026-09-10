import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core, rng } from './helpers.mjs';

const { Util: U, Model: M, Insights: I } = core();
const TODAY = '2026-09-10';

function ids(list) { return list.map((i) => i.id); }

test('nothing is claimed about an empty install', () => {
  const list = I.all(M.seedState(), TODAY);
  // The only thing worth saying is that there is nothing to go on.
  assert.deepEqual(ids(list), ['money-empty']);
});

test('a pattern is not reported from a handful of days', () => {
  const s = M.defaultState();
  const rand = rng(1);
  for (let i = 0; i < 6; i++) {
    const d = U.addDays(TODAY, -i);
    const sleep = 5 + rand() * 4;
    s.checkins[d] = M.checkin({ sleepHours: sleep, energy: Math.round(sleep - 3) });
  }
  assert.deepEqual(I.crossInsights(s, TODAY), [],
    'six days is not enough to say anything');
});

test('a real association is reported, with its sample size', () => {
  const s = M.defaultState();
  const rand = rng(7);
  for (let i = 89; i >= 0; i--) {
    const d = U.addDays(TODAY, -i);
    const sleep = Math.round((5 + rand() * 4) * 2) / 2;
    const energy = U.clamp(Math.round(sleep - 3.5 + rand() * 1.5), 1, 5);
    s.checkins[d] = M.checkin({ sleepHours: sleep, energy });
  }
  const found = I.crossInsights(s, TODAY).find((i) => i.id === 'cross-sleep-energy');
  assert.ok(found, 'a strong association should surface');
  assert.equal(found.sample, 90);
  assert.match(found.detail, /90 days/);
  assert.doesNotMatch(found.title + found.detail, /because|causes|caused/i,
    'these are associations and must never be worded as causes');
});

test('noise produces no pattern', () => {
  const s = M.defaultState();
  const rand = rng(99);
  for (let i = 89; i >= 0; i--) {
    const d = U.addDays(TODAY, -i);
    s.checkins[d] = M.checkin({
      sleepHours: Math.round((5 + rand() * 4) * 2) / 2,
      energy: U.clamp(Math.ceil(rand() * 5), 1, 5)
    });
  }
  const found = I.crossInsights(s, TODAY).find((i) => i.id === 'cross-sleep-energy');
  assert.equal(found, undefined, 'unrelated series must not be linked');
});

test('urgent things sort above the merely interesting', () => {
  const s = M.defaultState();
  s.money.cashPence = 5000;
  s.money.recurring = [M.recurring({ kind: 'expense', amountPence: 80000, cadence: 'monthly' })];
  s.gigs = [M.gig({ client: 'A', status: 'delivered', quotedPence: 90000, paidPence: 0 })];

  const list = I.all(s, TODAY);
  assert.ok(list.length >= 2);
  assert.equal(list[0].severity, 'urgent');
  const severities = list.map((i) => i.severity);
  const order = { urgent: 0, warn: 1, good: 2, info: 3 };
  for (let i = 1; i < severities.length; i++) {
    assert.ok(order[severities[i]] >= order[severities[i - 1]], 'must be sorted by severity');
  }
});

test('low runway is called out with a date', () => {
  const s = M.defaultState();
  s.settings.runwayWarnMonths = 3;
  s.money.cashPence = 100000;
  s.money.recurring = [M.recurring({ kind: 'expense', amountPence: 50000, cadence: 'monthly' })];
  const found = I.moneyInsights(s, TODAY).find((i) => i.id === 'money-runway-low');
  assert.ok(found);
  assert.match(found.detail, /\d/, 'a warning without a date is just anxiety');
});

test('a spending spike is judged against a projected month, not a partial one', () => {
  const s = M.defaultState();
  // Three prior months at a steady ~£100 on food.
  for (const m of [1, 2, 3]) {
    const base = U.startOfMonth(U.addMonths(U.startOfMonth(TODAY), -m));
    for (let k = 0; k < 4; k++) {
      s.money.transactions.push(M.transaction({
        date: U.addDays(base, k * 5), kind: 'expense', category: 'food', amountPence: 2500
      }));
    }
  }
  // This month, ten days in, already well past the usual run rate.
  for (let k = 0; k < 5; k++) {
    s.money.transactions.push(M.transaction({
      date: U.addDays(U.startOfMonth(TODAY), k), kind: 'expense',
      category: 'food', amountPence: 4000
    }));
  }
  const found = I.moneyInsights(s, TODAY).find((i) => i.id === 'money-spike-food');
  assert.ok(found, 'a genuine spike should surface');
  assert.equal(found.sample, 3);
});

test('steady spending is not reported as a spike', () => {
  const s = M.defaultState();
  for (const m of [0, 1, 2, 3]) {
    const base = U.startOfMonth(U.addMonths(U.startOfMonth(TODAY), -m));
    for (let k = 0; k < 4; k++) {
      s.money.transactions.push(M.transaction({
        date: U.addDays(base, k * 2), kind: 'expense', category: 'food', amountPence: 2500
      }));
    }
  }
  assert.equal(I.moneyInsights(s, TODAY).some((i) => i.id.startsWith('money-spike')), false);
});

test('streak milestones fire once, not every day', () => {
  const s = M.defaultState();
  const habit = M.habit({ name: 'Move' });
  s.habits = [habit];
  for (let i = 1; i <= 7; i++) s.habitLog[U.addDays(TODAY, -i)] = { [habit.id]: true };

  const atSeven = I.habitInsights(s, TODAY).filter((i) => i.id.startsWith('habit-streak'));
  assert.equal(atSeven.length, 1, 'a 7-day streak is a milestone');

  s.habitLog[U.addDays(TODAY, -8)] = { [habit.id]: true };
  const atEight = I.habitInsights(s, TODAY).filter((i) => i.id.startsWith('habit-streak'));
  assert.equal(atEight.length, 0, 'day eight is not, or it would nag daily');
});

// A state busy enough to trigger something from every family of insight.
function busyState() {
  const s = M.defaultState();
  const rand = rng(3);

  s.money.cashPence = 90000;
  s.money.recurring = [M.recurring({ kind: 'expense', amountPence: 80000, cadence: 'monthly' })];
  s.gigs = [
    M.gig({ client: 'A', status: 'delivered', quotedPence: 50000, dueDate: U.addDays(TODAY, -5) }),
    M.gig({ client: 'B', status: 'paid', paidPence: 30000, hoursEstimate: 5, hoursLogged: 9 }),
    M.gig({ client: 'C', status: 'paid', paidPence: 20000, hoursEstimate: 4, hoursLogged: 8 }),
    M.gig({ client: 'D', status: 'paid', paidPence: 10000, hoursEstimate: 2, hoursLogged: 4 })
  ];
  s.applications = [];
  for (let i = 0; i < 10; i++) {
    s.applications.push(M.application({
      company: 'Co ' + i, appliedDate: U.addDays(TODAY, -30 - i),
      status: i === 0 ? 'interview' : 'applied', salaryPence: 2500000
    }));
  }

  const habit = M.habit({ name: 'Move', cadence: 'daily' });
  s.habits = [habit];
  for (let i = 89; i >= 0; i--) {
    const d = U.addDays(TODAY, -i);
    const sleep = Math.round((5 + rand() * 4) * 2) / 2;
    const energy = U.clamp(Math.round(sleep - 3.5 + rand() * 1.4), 1, 5);
    const mood = U.clamp(Math.round(energy - 0.3 + rand()), 1, 5);
    s.checkins[d] = M.checkin({
      sleepHours: sleep, energy, mood,
      exerciseMins: sleep >= 7 && rand() < 0.7 ? 30 : 0
    });
    if (rand() < (sleep >= 7 ? 0.85 : 0.3)) s.habitLog[d] = { [habit.id]: true };
    if (rand() < 0.4) s.journal[d] = M.journalEntry({ win: 'Listed a few items' });
    if (rand() < 0.5) {
      s.money.transactions.push(M.transaction({
        date: d, kind: 'expense', category: 'food', amountPence: 1000 + Math.round(rand() * 3000)
      }));
    }
    if (rand() < 0.3) {
      s.money.transactions.push(M.transaction({
        date: d, kind: 'income', stream: 'ebay', amountPence: 3000 + Math.round(rand() * 6000)
      }));
    }
  }
  return s;
}

test('every insight carries a title and a real explanation', () => {
  const list = I.all(busyState(), TODAY);
  assert.ok(list.length >= 5, 'this state should trigger a good spread of insights');

  for (const i of list) {
    assert.ok(i.id && i.title, 'insight needs an identity and a headline');
    assert.ok(i.detail && i.detail.length > 10, i.id + ' needs a real explanation');
    assert.ok(['urgent', 'warn', 'good', 'info'].includes(i.severity));
    assert.ok(['money', 'work', 'habits', 'health', 'cross'].includes(i.domain));
  }
});

test('no insight anywhere claims one thing causes another', () => {
  // These are correlations over a few dozen days of self-reported numbers.
  // Wording any of them as cause is the single easiest way for this app to
  // start lying to its user.
  const causal = /\b(because|causes?|caused|causing|due to|leads? to|makes? you|proves?)\b/i;

  const list = I.all(busyState(), TODAY);
  assert.ok(list.length >= 5);
  for (const i of list) {
    const text = i.title + ' ' + i.detail;
    assert.doesNotMatch(text, causal, i.id + ' is worded as a cause: ' + text);
  }
});

test('every insight that reports a comparison states its sample', () => {
  for (const i of I.crossInsights(busyState(), TODAY)) {
    assert.ok(i.sample > 0, i.id + ' must record how much data it used');
    assert.match(i.detail, /\d+\s*(days?|weeks?|months?)/,
      i.id + ' must say the sample size in words the user reads');
  }
});
