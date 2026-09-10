import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Review: R } = core();
const TODAY = '2026-09-10';         // a Thursday
const LAST_WEEK = '2026-08-31';     // the Monday before

test('the review covers the week that just finished', () => {
  const s = M.defaultState();
  s.settings.reviewWeekday = 6; // Sunday
  const start = R.reviewWeekStart(s, TODAY);
  assert.equal(start, U.addDays(U.startOfWeek(TODAY), -7),
    'mid-week, you review the week gone');

  // On the review day itself, the week ending today is the one in question.
  const sunday = '2026-09-13';
  assert.equal(R.reviewWeekStart(s, sunday), U.startOfWeek(sunday));
});

test('an unlogged area scores null, never zero', () => {
  const s = M.defaultState();
  const habit = M.habit({ name: 'Move' });
  s.habits = [habit];
  for (let i = 0; i < 7; i++) s.habitLog[U.addDays(LAST_WEEK, i)] = { [habit.id]: true };

  const d = R.fullDigest(s, LAST_WEEK, TODAY);
  assert.equal(d.scores.habits, 100);
  assert.equal(d.scores.money, null, 'no transactions means unknown, not a zero');
  assert.equal(d.scores.work, null);
  assert.equal(d.scores.domainsScored, 1);
  assert.equal(d.scores.overall, 100, 'only scored areas count toward the total');
});

test('a completely empty week has no score at all', () => {
  const d = R.fullDigest(M.defaultState(), LAST_WEEK, TODAY);
  assert.equal(d.scores.overall, null);
  assert.equal(d.scores.domainsScored, 0);
});

test('money is judged against your own recent weeks, not a fixed budget', () => {
  const s = M.defaultState();
  // Eight prior weeks at roughly £100 out and nothing in — a monthly-income life.
  for (let w = 1; w <= 8; w++) {
    const start = U.addDays(LAST_WEEK, -7 * w);
    s.money.transactions.push(M.transaction({
      date: start, kind: 'expense', category: 'food', amountPence: 10000
    }));
  }
  // The week under review: spent half the usual, still earned nothing.
  s.money.transactions.push(M.transaction({
    date: LAST_WEEK, kind: 'expense', category: 'food', amountPence: 5000
  }));

  const d = R.fullDigest(s, LAST_WEEK, TODAY);
  assert.equal(d.money.baselineWeeks, 8);
  assert.ok(d.scores.money > 60,
    'a week under your own normal should score well even with no income that week');
});

test('a heavy spending week scores below an ordinary one', () => {
  function weekScore(thisWeekPence) {
    const s = M.defaultState();
    for (let w = 1; w <= 8; w++) {
      s.money.transactions.push(M.transaction({
        date: U.addDays(LAST_WEEK, -7 * w), kind: 'expense', amountPence: 10000
      }));
    }
    s.money.transactions.push(M.transaction({
      date: LAST_WEEK, kind: 'expense', amountPence: thisWeekPence
    }));
    return R.fullDigest(s, LAST_WEEK, TODAY).scores.money;
  }
  assert.ok(weekScore(30000) < weekScore(10000));
  assert.ok(weekScore(10000) < weekScore(4000));
});

test('a quiet week with a live pipeline is not a zero', () => {
  const s = M.defaultState();
  s.applications = [M.application({
    company: 'DNEG', status: 'interview', appliedDate: U.addDays(LAST_WEEK, -40)
  })];
  const d = R.fullDigest(s, LAST_WEEK, TODAY);
  assert.equal(d.work.applicationsSent, 0);
  assert.ok(d.scores.work >= 30,
    'waiting on people who have your application is not a failed week');
});

test('tasks are scored against the week before, not a quota', () => {
  const s = M.defaultState();
  const prior = U.addDays(LAST_WEEK, -7);
  for (let i = 0; i < 4; i++) {
    s.tasks.push(M.task({ title: 'Prior ' + i, done: true, doneDate: U.addDays(prior, i) }));
  }
  for (let i = 0; i < 4; i++) {
    s.tasks.push(M.task({ title: 'Now ' + i, done: true, doneDate: U.addDays(LAST_WEEK, i) }));
  }
  const d = R.fullDigest(s, LAST_WEEK, TODAY);
  assert.equal(d.tasks.completed, 4);
  assert.equal(d.tasks.prior, 4);
  assert.equal(d.tasks.delta, 0);
  assert.equal(d.scores.tasks, 60, 'matching last week is a solid, not perfect, score');
});

test('the digest gathers every domain for the right seven days', () => {
  const s = M.defaultState();
  const habit = M.habit({ name: 'Move' });
  s.habits = [habit];
  s.habitLog[LAST_WEEK] = { [habit.id]: true };
  s.habitLog[U.addDays(LAST_WEEK, -1)] = { [habit.id]: true };  // week before
  s.checkins[LAST_WEEK] = M.checkin({ sleepHours: 8, mood: 4, exerciseMins: 30 });
  s.journal[LAST_WEEK] = M.journalEntry({ win: 'Listed four items' });
  s.money.transactions.push(M.transaction({
    date: LAST_WEEK, kind: 'income', stream: 'ebay', amountPence: 5000
  }));

  const d = R.fullDigest(s, LAST_WEEK, TODAY);
  assert.equal(d.period.start, LAST_WEEK);
  assert.equal(d.period.end, U.addDays(LAST_WEEK, 6));
  assert.equal(d.habits.perHabit[0].done, 1, 'the day before must not be counted');
  assert.equal(d.health.loggedDays, 1);
  assert.equal(d.health.moveDays, 1);
  assert.equal(d.money.incomePence, 5000);
  assert.equal(d.journal.wins.length, 1);
  assert.equal(d.journal.wins[0].text, 'Listed four items');
});

test('week listing always offers the current week', () => {
  const weeks = R.weeksWithData(M.defaultState(), 12, TODAY);
  assert.ok(weeks.length >= 1);
  assert.equal(weeks[0].start, U.startOfWeek(TODAY));
});

test('a saved write-up is found by its week key', () => {
  const s = M.defaultState();
  s.reviews = [M.review({ weekKey: U.isoWeekKey(LAST_WEEK), wins: 'Shipped the render' })];
  assert.equal(R.savedReview(s, U.isoWeekKey(LAST_WEEK)).wins, 'Shipped the render');
  assert.equal(R.savedReview(s, '2020-W01'), null);
});
