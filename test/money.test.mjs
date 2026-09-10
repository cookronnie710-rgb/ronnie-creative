import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Money: Mo } = core();
const TODAY = '2026-09-10';

function state(overrides = {}) {
  const s = M.defaultState();
  return Object.assign(s, overrides);
}

test('cadences normalise to a monthly figure', () => {
  const weekly = M.recurring({ amountPence: 10000, cadence: 'weekly' });
  const fortnightly = M.recurring({ amountPence: 10000, cadence: 'fortnightly' });
  const annual = M.recurring({ amountPence: 120000, cadence: 'annual' });

  // 52 weeks a year, not 4 a month — that gap is a month of rent over time.
  assert.equal(Math.round(Mo.monthlyAmount(weekly)), 43333);
  assert.equal(Math.round(Mo.monthlyAmount(fortnightly)), 21667);
  assert.equal(Mo.monthlyAmount(annual), 10000);
});

test('placeholder items with no amount do not count as a plan', () => {
  const s = state();
  s.money.recurring = [
    M.recurring({ label: 'Rent', kind: 'expense', amountPence: 0 }),
    M.recurring({ label: 'Bills', kind: 'expense', amountPence: 0 })
  ];
  assert.equal(Mo.plannedMonthly(s).count, 0);
  assert.equal(Mo.runway(s, TODAY).basis, 'none');
  assert.equal(Mo.runway(s, TODAY).status, 'unknown',
    'an empty plan must not read as a healthy one');
});

test('runway divides cash by the monthly shortfall', () => {
  const s = state();
  s.money.cashPence = 280000;
  s.money.recurring = [
    M.recurring({ kind: 'expense', amountPence: 75000, cadence: 'monthly' }),
    M.recurring({ kind: 'income', amountPence: 15000, cadence: 'weekly' })
  ];
  const r = Mo.runway(s, TODAY);
  // £650 in, £750 out -> £100 a month down, £2,800 in the bank.
  assert.equal(r.netPence, -10000);
  assert.equal(r.months, 28);
  assert.equal(r.basis, 'planned');
  assert.ok(r.zeroDate > TODAY);
});

test('runway reports growth as growth, never as a number of months', () => {
  const s = state();
  s.money.cashPence = 100000;
  s.money.recurring = [M.recurring({ kind: 'income', amountPence: 200000, cadence: 'monthly' })];
  const r = Mo.runway(s, TODAY);
  assert.equal(r.status, 'growing');
  assert.equal(r.months, null, 'months must be null, not 0, when nothing is being lost');
});

test('runway flags an empty account as critical', () => {
  const s = state();
  s.money.cashPence = 0;
  s.money.recurring = [M.recurring({ kind: 'expense', amountPence: 50000, cadence: 'monthly' })];
  const r = Mo.runway(s, TODAY);
  assert.equal(r.status, 'critical');
  assert.equal(r.months, 0);
});

test('logged transactions take over from the plan once there are enough', () => {
  const s = state();
  s.money.cashPence = 500000;
  s.money.recurring = [M.recurring({ kind: 'expense', amountPence: 10000, cadence: 'monthly' })];

  // Two complete months of real spending.
  for (const m of [1, 2]) {
    const base = U.startOfMonth(U.addMonths(U.startOfMonth(TODAY), -m));
    s.money.transactions.push(M.transaction({ date: base, kind: 'expense', amountPence: 80000 }));
    s.money.transactions.push(M.transaction({
      date: U.addDays(base, 5), kind: 'income', stream: 'ebay', amountPence: 30000
    }));
  }

  const est = Mo.burnEstimate(s, TODAY);
  assert.equal(est.basis, 'actual');
  assert.equal(est.monthsSampled, 2);
  assert.equal(est.netPence, -50000, 'should follow what happened, not the plan');
});

test('goal projection separates what you do from what you would need', () => {
  const goal = M.goal({
    targetPence: 100000, savedPence: 40000,
    targetDate: U.addMonths(TODAY, 2), monthlyPence: 10000
  });
  const p = Mo.goalProjection(goal, 0, TODAY);
  assert.equal(p.remainingPence, 60000);
  assert.equal(p.progressPct, 40);
  assert.equal(p.onTrack, false, '£100/mo cannot cover £600 in two months');
  assert.ok(p.requiredMonthlyPence > 10000);
});

test('a finished goal is finished, not projected into the future', () => {
  const goal = M.goal({ targetPence: 50000, savedPence: 50000 });
  const p = Mo.goalProjection(goal, 10000, TODAY);
  assert.equal(p.remainingPence, 0);
  assert.equal(p.monthsToTarget, 0);
  assert.equal(p.onTrack, true);
});

test('stream coverage says what share of outgoings each source carries', () => {
  const s = state();
  for (const m of [1, 2]) {
    const base = U.startOfMonth(U.addMonths(U.startOfMonth(TODAY), -m));
    s.money.transactions.push(M.transaction({
      date: base, kind: 'income', stream: 'ebay', amountPence: 50000
    }));
    s.money.transactions.push(M.transaction({
      date: base, kind: 'expense', amountPence: 100000
    }));
  }
  const cov = Mo.streamCoverage(s, TODAY);
  assert.equal(cov.months, 2);
  assert.equal(cov.streams[0].id, 'ebay');
  assert.equal(cov.streams[0].coveragePct, 50);
});

test('next due date rolls forward and clamps to short months', () => {
  assert.equal(Mo.nextDueDate(15, '2026-09-10'), '2026-09-15');
  assert.equal(Mo.nextDueDate(5, '2026-09-10'), '2026-10-05', 'already passed this month');
  assert.equal(Mo.nextDueDate(31, '2026-02-01'), '2026-02-28', 'February has no 31st');
});
