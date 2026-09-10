import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Habits: H } = core();
const TODAY = '2026-09-10';

function withHabit(fields = {}) {
  const s = M.defaultState();
  const habit = M.habit(Object.assign({ name: 'Move', cadence: 'daily' }, fields));
  s.habits = [habit];
  return { s, habit };
}

function tick(s, habit, day) {
  (s.habitLog[day] || (s.habitLog[day] = {}))[habit.id] = true;
}

test('the day in progress never breaks a daily streak', () => {
  const { s, habit } = withHabit();
  for (let i = 1; i <= 5; i++) tick(s, habit, U.addDays(TODAY, -i));

  const st = H.streak(s, habit, TODAY);
  assert.equal(st.current, 5, 'not doing it *yet* today is not a broken streak');
  assert.equal(st.doneToday, false);

  tick(s, habit, TODAY);
  assert.equal(H.streak(s, habit, TODAY).current, 6);
});

test('a genuine gap does break the streak', () => {
  const { s, habit } = withHabit();
  for (let i = 2; i <= 6; i++) tick(s, habit, U.addDays(TODAY, -i));
  // Nothing yesterday and nothing today: the run ended.
  assert.equal(H.streak(s, habit, TODAY).current, 0);
  assert.equal(H.streak(s, habit, TODAY).best, 5, 'the best run is still remembered');
});

test('best streak survives later lapses', () => {
  const { s, habit } = withHabit();
  for (let i = 30; i >= 21; i--) tick(s, habit, U.addDays(TODAY, -i)); // 10 in a row
  for (let i = 3; i >= 1; i--) tick(s, habit, U.addDays(TODAY, -i));   // 3 in a row
  const st = H.streak(s, habit, TODAY);
  assert.equal(st.current, 3);
  assert.equal(st.best, 10);
});

test('weekly habits are counted in weeks against their target', () => {
  const { s, habit } = withHabit({ cadence: 'weekly', targetPerWeek: 3 });
  // Three ticks in each of the two previous whole weeks.
  for (const w of [1, 2]) {
    const start = U.addDays(U.startOfWeek(TODAY), -7 * w);
    for (let d = 0; d < 3; d++) tick(s, habit, U.addDays(start, d));
  }
  const st = H.streak(s, habit, TODAY);
  assert.equal(st.unit, 'week');
  assert.equal(st.current, 2, 'this week being unfinished must not break it');
});

test('a weekly habit short of target does not count that week', () => {
  const { s, habit } = withHabit({ cadence: 'weekly', targetPerWeek: 3 });
  const start = U.addDays(U.startOfWeek(TODAY), -7);
  tick(s, habit, start);
  tick(s, habit, U.addDays(start, 1)); // only two of three
  assert.equal(H.streak(s, habit, TODAY).current, 0);
});

test('completion rate is measured against days that could have happened', () => {
  const { s, habit } = withHabit();
  for (let i = 0; i < 15; i++) tick(s, habit, U.addDays(TODAY, -i));
  const r = H.completionRate(s, habit, 30, TODAY);
  assert.equal(r.done, 15);
  assert.equal(r.possible, 30);
  assert.equal(Math.round(r.pct), 50);
});

test('the heatmap grid is Monday-first and marks the future as future', () => {
  const { s, habit } = withHabit();
  const grid = H.heatmap(s, habit, 4, TODAY);
  assert.equal(grid.length, 4);
  assert.equal(grid[0].days.length, 7);
  assert.equal(U.dayOfWeek(grid[0].weekStart), 0, 'weeks start on Monday');

  const lastWeek = grid[grid.length - 1].days;
  const future = lastWeek.filter((d) => d.future);
  assert.ok(future.every((d) => U.daysBetween(TODAY, d.date) > 0));
  assert.ok(lastWeek.some((d) => !d.future));
});

test('todayView marks a met weekly target as no longer needed', () => {
  const { s, habit } = withHabit({ cadence: 'weekly', targetPerWeek: 2 });
  const start = U.startOfWeek(TODAY);
  tick(s, habit, start);
  tick(s, habit, U.addDays(start, 1));
  const view = H.todayView(s, TODAY)[0];
  assert.equal(view.week.met, true);
  assert.equal(view.needed, false, 'target met means it should stop asking');
});

test('slipping habits are only reported against a real prior baseline', () => {
  const { s, habit } = withHabit();
  // Solid for the fortnight before last, then a sharp drop.
  for (let i = 42; i > 14; i--) {
    if (i % 4 !== 0) tick(s, habit, U.addDays(TODAY, -i));
  }
  for (let i = 14; i >= 0; i--) {
    if (i % 7 === 0) tick(s, habit, U.addDays(TODAY, -i));
  }
  const slipping = H.slipping(s, TODAY);
  assert.equal(slipping.length, 1);
  assert.ok(slipping[0].delta <= -20);
});

test('a habit with no history reports nothing rather than a drop', () => {
  const { s } = withHabit();
  assert.deepEqual(H.slipping(s, TODAY), []);
});
