import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Export: E } = core();
const TODAY = '2026-09-10';

function populated() {
  const s = M.seedState();
  s.money.cashPence = 120000;
  s.money.transactions = [
    M.transaction({ date: TODAY, label: 'PS1 job lot', kind: 'income', stream: 'ebay', amountPence: 8500 }),
    M.transaction({ date: TODAY, label: 'Food shop', kind: 'expense', category: 'food', amountPence: 2340 })
  ];
  s.checkins[TODAY] = M.checkin({ sleepHours: 7.5, energy: 4, mood: 4, exerciseMins: 30 });
  s.journal[TODAY] = M.journalEntry({ text: 'Sorted the loft.', win: 'Listed four items' });
  s.habitLog[TODAY] = { [s.habits[0].id]: true };
  return s;
}

test('a backup round-trips without losing anything', () => {
  const s = populated();
  const restored = E.fromJSON(E.toJSON(s));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.money.cashPence, 120000);
  assert.equal(restored.state.money.transactions.length, 2);
  assert.equal(restored.state.journal[TODAY].win, 'Listed four items');
});

test('a bare state restores as well as a wrapped export', () => {
  const s = populated();
  const bare = E.fromJSON(JSON.stringify(s));
  assert.equal(bare.ok, true);
  assert.equal(bare.state.money.cashPence, 120000);
});

test('rubbish files are refused with something a person can read', () => {
  for (const [input, expected] of [
    ['not json at all', /not valid JSON/],
    ['{"hello":"world"}', /does not look like a Keel backup/],
    ['null', /does not contain a backup/],
    ['[1,2,3]', /does not look like a Keel backup/]
  ]) {
    const r = E.fromJSON(input);
    assert.equal(r.ok, false, 'should refuse: ' + input);
    assert.match(r.error, expected);
  }
});

test('the UK tax year runs 6 April to 5 April', () => {
  assert.deepEqual(E.taxYearRange(2026), {
    from: '2026-04-06', to: '2027-04-05', label: '2026/27'
  });
  assert.equal(E.currentTaxYear('2026-09-10'), 2026);
  assert.equal(E.currentTaxYear('2026-04-06'), 2026, 'the first day of the year');
  assert.equal(E.currentTaxYear('2026-04-05'), 2025, 'the last day of the one before');
  assert.equal(E.currentTaxYear('2026-01-31'), 2025);
});

test('CSV keeps numbers numeric and neutralises formulas', () => {
  const s = M.defaultState();
  s.money.transactions = [
    M.transaction({ date: TODAY, label: 'Sale', kind: 'income', stream: 'ebay', amountPence: 8500 }),
    M.transaction({ date: TODAY, label: '=SUM(A1:A9)', kind: 'expense', category: 'food', amountPence: 2340 })
  ];
  const csv = E.transactionsCSV(s, '2026-04-06', '2027-04-05');
  const lines = csv.trim().split('\r\n');

  assert.match(lines[1], /,85,/, 'income stays a plain number a spreadsheet can total');
  assert.match(lines[2], /,-23\.4,/, 'the minus sign must not be escaped away');
  // A leading = is defused with an apostrophe. No quoting is needed here
  // because the value holds no comma; a value that did would also be quoted.
  assert.match(lines[2], /,'=SUM\(A1:A9\),/, 'a leading = is defused before it reaches Excel');
  const withComma = E.csvRows([['=cmd(),x']]).trim();
  assert.equal(withComma, `"'=cmd(),x"`, 'and quoted too when it contains a comma');
});

test('income is labelled by stream and spending by category', () => {
  const s = populated();
  const csv = E.transactionsCSV(s, '2026-04-06', '2027-04-05');
  assert.match(csv, /eBay \/ reselling/, "not 'Ebay'");
  assert.match(csv, /Income,PS1 job lot,,eBay/, 'income carries no expense category');
});

test('a daily note carries frontmatter and the day it describes', () => {
  const note = E.dailyNote(populated(), TODAY);
  assert.match(note, /^---\n/);
  assert.match(note, /date: "2026-09-10"/);
  assert.match(note, /sleep: 7\.5/);
  assert.match(note, /# Thu 10 September 2026/);
  assert.match(note, /Listed four items/);
  assert.match(note, /\+£85\.00 — PS1 job lot/);
});

test('a day with nothing on it produces no note', () => {
  assert.equal(E.dailyNote(M.defaultState(), TODAY), null);
});

test('the exported vault is shaped like a vault', () => {
  const files = E.obsidianFiles(populated());
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('Keel/Overview.md'));
  assert.ok(paths.some((p) => /^Keel\/Daily\/\d{4}-\d{2}-\d{2}\.md$/.test(p)));
  assert.ok(paths.some((p) => /^Keel\/Weekly\/\d{4}-W\d{2}\.md$/.test(p)));
  assert.ok(files.every((f) => f.content && f.content.length > 0));
});

test('the zip it writes is a zip that real tools can open', () => {
  const files = E.obsidianFiles(populated());
  const bytes = E.zip(files);

  assert.equal(bytes[0], 0x50, 'PK signature');
  assert.equal(bytes[1], 0x4B);

  const dir = mkdtempSync(join(tmpdir(), 'keel-zip-'));
  const path = join(dir, 'notes.zip');
  writeFileSync(path, Buffer.from(bytes));

  // The real proof is that unzip accepts it, CRCs and all.
  const check = execFileSync('unzip', ['-t', path], { encoding: 'utf8' });
  assert.match(check, /No errors detected/);

  const listing = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' });
  assert.ok(listing.includes('Keel/Overview.md'));
  assert.equal(listing.trim().split('\n').length, files.length);
});

test('CRC32 matches the known check value', () => {
  // The standard CRC-32 of "123456789".
  const bytes = new Uint8Array([...'123456789'].map((c) => c.charCodeAt(0)));
  assert.equal(E.crc32(bytes), 0xCBF43926);
});
