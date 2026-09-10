import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core, freshStore } from './helpers.mjs';

const K = core();
const { Util: U, Model: M, Store } = K;

test('a first run seeds; a second run restores', () => {
  const storage = Store.memoryStorage();
  const a = Store.create({ storage });
  a.load();
  assert.equal(a.isFresh, true);
  a.actions.addTask({ title: 'Post the PS2 lot' });
  a.saveNow();

  const b = Store.create({ storage });
  b.load();
  assert.equal(b.isFresh, false);
  assert.ok(b.state.tasks.some((t) => t.title === 'Post the PS2 lot'));
});

test('unreadable saved data is kept aside rather than thrown away', () => {
  const CORRUPT = '{ this is not json';
  const map = { 'keel.state.v1': CORRUPT };
  const storage = {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; }
  };

  const store = Store.create({ storage });
  store.load();

  assert.ok(store.error, 'the user should be told rather than silently restarted');
  assert.equal(store.isFresh, true, 'it falls back to a working app');

  // The unreadable blob must still exist somewhere so it can be recovered
  // by hand. Losing a year of someone's data to a bad byte is not acceptable.
  const parked = Object.keys(map).filter((k) => k.startsWith('keel.state.v1.corrupt.'));
  assert.equal(parked.length, 1, 'the corrupt copy is parked under a new key');
  assert.equal(map[parked[0]], CORRUPT, 'and kept byte for byte');
});

test('a storage that throws does not stop the app', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const store = Store.create({ storage: hostile });
  assert.doesNotThrow(() => store.load());
  assert.ok(store.state, 'the app still has a state to render');
  store.actions.addTask({ title: 'Still works' });
  assert.equal(store.state.tasks[0].title, 'Still works');
  assert.equal(store.saveNow(), false);
  assert.ok(store.error);
});

test('undo restores the previous state and redo puts it back', () => {
  const store = freshStore();
  const task = store.actions.addTask({ title: 'Chase invoice' });
  assert.equal(store.state.tasks[0].done, false);

  store.actions.toggleTask(task.id);
  assert.equal(store.state.tasks[0].done, true);

  assert.equal(store.undo(), 'task');
  assert.equal(store.state.tasks[0].done, false);

  assert.equal(store.redo(), 'task');
  assert.equal(store.state.tasks[0].done, true);
});

test('undo is bounded so a long session cannot grow without limit', () => {
  const store = freshStore();
  for (let i = 0; i < 60; i++) store.actions.addTask({ title: 'Task ' + i });
  let undone = 0;
  while (store.canUndo() && undone < 100) { store.undo(); undone++; }
  assert.ok(undone <= 25, 'history is capped');
  assert.ok(undone > 0);
});

test('typing does not fill the undo stack with one entry per keystroke', () => {
  const store = freshStore();
  const before = store.canUndo();
  for (const text of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
    store.actions.setJournal('2026-09-10', { text });
  }
  assert.equal(store.canUndo(), before, 'a patch is not an undo point');
  assert.equal(store.state.journal['2026-09-10'].text, 'Hello');
});

test('subscribers are told what changed, and one throwing does not break the rest', () => {
  const store = freshStore();
  const seen = [];
  store.subscribe(() => { throw new Error('a broken listener'); });
  store.subscribe((state, reason) => seen.push(reason));

  assert.doesNotThrow(() => store.actions.addTask({ title: 'x' }));
  assert.deepEqual(seen, ['add task']);
});

test('marking a job paid records the income exactly once', () => {
  const store = freshStore();
  const gig = store.actions.addGig({
    client: 'Harlow Joinery', title: 'Kitchen visual',
    quotedPence: 45000, status: 'delivered'
  });

  store.actions.setGigStatus(gig.id, 'paid');
  const income = store.state.money.transactions.filter((t) => t.notes === 'gig:' + gig.id);
  assert.equal(income.length, 1);
  assert.equal(income[0].amountPence, 45000);
  assert.equal(income[0].stream, 'freelance');

  // Re-marking must not double-count.
  store.actions.setGigStatus(gig.id, 'paid');
  assert.equal(
    store.state.money.transactions.filter((t) => t.notes === 'gig:' + gig.id).length, 1);
});

test('moving an application resets the follow-up clock', () => {
  const store = freshStore();
  const app = store.actions.addApplication({
    company: 'DNEG', appliedDate: U.addDays(store.today(), -30)
  });
  assert.equal(app.lastContact, null);
  store.actions.setApplicationStatus(app.id, 'interview');
  const updated = store.state.applications.find((a) => a.id === app.id);
  assert.equal(updated.status, 'interview');
  assert.equal(updated.lastContact, store.today(), 'moving stage is contact');
});

test('deleting a project keeps its tasks', () => {
  const store = freshStore();
  const project = store.actions.addProject({ name: 'Reselling' });
  store.actions.addTask({ title: 'List the lot', projectId: project.id });
  store.actions.deleteProject(project.id);

  assert.ok(store.state.tasks.some((t) => t.title === 'List the lot'),
    'the work survives the folder it was in');
  assert.equal(store.state.tasks.find((t) => t.title === 'List the lot').projectId, null);
});

test('deleting a habit takes its ticks with it', () => {
  const store = freshStore();
  const habit = store.actions.addHabit({ name: 'Run' });
  store.actions.toggleHabit(habit.id, store.today());
  assert.ok(store.state.habitLog[store.today()]);

  store.actions.deleteHabit(habit.id);
  assert.equal(store.state.habitLog[store.today()], undefined);
});

test('reset returns a fresh install and is itself undoable', () => {
  const store = freshStore();
  store.actions.addTask({ title: 'Something important' });
  store.reset();
  assert.equal(store.state.tasks.length, 0);
  store.undo();
  assert.ok(store.state.tasks.some((t) => t.title === 'Something important'));
});
