import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Tasks: T, Health: H } = core();
const TODAY = '2026-09-10';

/* ------------------------------------------------------------------ tasks */

test('the today list leads with what is late', () => {
  const s = M.defaultState();
  s.tasks = [
    M.task({ title: 'Someday idea', someday: true }),
    M.task({ title: 'Due today', dueDate: TODAY }),
    M.task({ title: 'Late', dueDate: U.addDays(TODAY, -3) }),
    M.task({ title: 'Next week', dueDate: U.addDays(TODAY, 7) }),
    M.task({ title: 'Undated but important', priority: 3 })
  ];
  const titles = T.todayList(s, TODAY, 5).map((t) => t.title);
  assert.equal(titles[0], 'Late');
  assert.equal(titles[1], 'Due today');
  assert.ok(!titles.includes('Someday idea'), 'parked work stays parked');
  assert.ok(!titles.includes('Next week'), 'not urgent yet');
});

test('the today list is topped up so a clear day is not an empty screen', () => {
  const s = M.defaultState();
  s.tasks = [
    M.task({ title: 'A', priority: 3 }),
    M.task({ title: 'B', priority: 1 }),
    M.task({ title: 'C', priority: 2 })
  ];
  const list = T.todayList(s, TODAY, 5);
  assert.equal(list.length, 3);
  assert.equal(list[0].title, 'A', 'highest priority first');
});

test('completed tasks are found by the day they were finished', () => {
  const s = M.defaultState();
  s.tasks = [
    M.task({ title: 'In range', done: true, doneDate: '2026-09-08' }),
    M.task({ title: 'Out of range', done: true, doneDate: '2026-08-01' }),
    M.task({ title: 'Never finished', done: false })
  ];
  const done = T.completedIn(s, '2026-09-07', '2026-09-13');
  assert.equal(done.length, 1);
  assert.equal(done[0].title, 'In range');
});

test('stale work is measured from when it was created', () => {
  const s = M.defaultState();
  s.tasks = [
    M.task({ title: 'Old', createdAt: U.addDays(TODAY, -60) }),
    M.task({ title: 'New', createdAt: U.addDays(TODAY, -2) })
  ];
  const stale = T.stale(s, 30, TODAY);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].task.title, 'Old');
  assert.equal(stale[0].ageDays, 60);
});

test('throughput reports one entry per week, oldest first', () => {
  const s = M.defaultState();
  s.tasks = [M.task({ title: 'x', done: true, doneDate: TODAY })];
  const weeks = T.throughput(s, 4, TODAY);
  assert.equal(weeks.length, 4);
  assert.equal(weeks[3].completed, 1, 'this week is last');
  assert.equal(weeks[0].completed, 0);
  assert.ok(weeks[0].weekStart < weeks[3].weekStart);
});

test('loose tasks get a group of their own', () => {
  const s = M.defaultState();
  const p = M.project({ name: 'Reselling' });
  s.projects = [p];
  s.tasks = [
    M.task({ title: 'In project', projectId: p.id }),
    M.task({ title: 'Loose' })
  ];
  const groups = T.byProject(s);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].project.name, 'No project');
  assert.equal(groups[1].open, 1);
});

/* ----------------------------------------------------------------- health */

test('a day you forgot to log is not a day of zero sleep', () => {
  const s = M.defaultState();
  s.checkins[TODAY] = M.checkin({ sleepHours: 8 });
  s.checkins[U.addDays(TODAY, -2)] = M.checkin({ sleepHours: 6 });

  const series = H.series(s, 'sleepHours', 7, TODAY);
  assert.equal(series.length, 2, 'missing days are absent, not zero-filled');

  const avg = H.average(s, 'sleepHours', 7, TODAY);
  assert.equal(avg.value, 7, 'the average is over what was logged');
  assert.equal(avg.sample, 2);
});

test('a trend needs enough on both sides before it claims a direction', () => {
  const s = M.defaultState();
  for (let i = 0; i < 4; i++) s.checkins[U.addDays(TODAY, -i)] = M.checkin({ sleepHours: 8 });
  assert.equal(H.trend(s, 'sleepHours', 14, TODAY), null, 'nothing to compare against');

  for (let i = 14; i < 20; i++) s.checkins[U.addDays(TODAY, -i)] = M.checkin({ sleepHours: 6 });
  const t = H.trend(s, 'sleepHours', 14, TODAY);
  assert.ok(t);
  assert.equal(t.recent, 8);
  assert.equal(t.prior, 6);
  assert.equal(t.delta, 2);
});

test('paired days only include days where both were recorded', () => {
  const s = M.defaultState();
  s.checkins['2026-09-08'] = M.checkin({ sleepHours: 8, mood: 4 });
  s.checkins['2026-09-09'] = M.checkin({ sleepHours: 7 });          // no mood
  s.checkins['2026-09-10'] = M.checkin({ mood: 3 });                // no sleep
  const paired = H.pairedDays(s, 'sleepHours', 'mood', 30, TODAY);
  assert.equal(paired.n, 1);
  assert.deepEqual(paired.dates, ['2026-09-08']);
});

test('the logging streak tolerates today not being written yet', () => {
  const s = M.defaultState();
  for (let i = 1; i <= 4; i++) s.checkins[U.addDays(TODAY, -i)] = M.checkin({ mood: 3 });
  assert.equal(H.logStreak(s, TODAY), 4);
  s.checkins[TODAY] = M.checkin({ mood: 4 });
  assert.equal(H.logStreak(s, TODAY), 5);
});

test('a check-in with only a note still counts as logged', () => {
  const s = M.defaultState();
  s.checkins[TODAY] = M.checkin({ note: 'Back playing up.' });
  assert.equal(H.hasAny(s, TODAY), true);
  assert.equal(H.loggedDays(s, 7, TODAY).logged, 1);
});
