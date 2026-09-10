import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U } = core();

test('ISO dates round-trip through local time', () => {
  assert.equal(U.toISODate(new Date(2026, 8, 10)), '2026-09-10');
  assert.equal(U.isISODate('2026-09-10'), true);
  assert.equal(U.isISODate('2026-13-01'), false);
  assert.equal(U.isISODate('2026-02-31'), false, 'rolled-over dates must be rejected');
  assert.equal(U.isISODate('nonsense'), false);
  assert.equal(U.fromISODate(''), null);
});

test('addMonths clamps rather than rolling into the next month', () => {
  assert.equal(U.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(U.addMonths('2028-01-31', 1), '2028-02-29', 'leap year');
  assert.equal(U.addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(U.addMonths('2026-12-15', 1), '2027-01-15');
});

test('daysBetween is unaffected by daylight saving', () => {
  // UK clocks go forward on 29 March 2026 and back on 25 October 2026.
  assert.equal(U.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(U.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(U.daysBetween('2026-09-10', '2026-09-10'), 0);
  assert.equal(U.daysBetween('2026-09-11', '2026-09-10'), -1);
});

test('weeks start on Monday and ISO week keys match the standard', () => {
  assert.equal(U.startOfWeek('2026-09-10'), '2026-09-07'); // a Thursday
  assert.equal(U.startOfWeek('2026-09-07'), '2026-09-07'); // Monday itself
  assert.equal(U.startOfWeek('2026-09-13'), '2026-09-07'); // Sunday
  assert.equal(U.isoWeekKey('2026-09-10'), '2026-W37');
  // 1 January 2027 is a Friday, so it belongs to week 53 of 2026.
  assert.equal(U.isoWeekKey('2027-01-01'), '2026-W53');
});

test('dateRange is inclusive and refuses to run away', () => {
  assert.equal(U.dateRange('2026-09-01', '2026-09-07').length, 7);
  assert.deepEqual(U.dateRange('2026-09-05', '2026-09-04'), []);
  assert.deepEqual(U.dateRange('rubbish', '2026-09-04'), []);
  assert.ok(U.dateRange('1900-01-01', '2026-09-04').length <= 3660, 'must be capped');
});

test('money parses the ways people actually type it', () => {
  assert.equal(U.parseMoney('12'), 1200);
  assert.equal(U.parseMoney('12.50'), 1250);
  assert.equal(U.parseMoney('£12.50'), 1250);
  assert.equal(U.parseMoney('1,200'), 120000);
  assert.equal(U.parseMoney(' 12.5 '), 1250);
  assert.equal(U.parseMoney('-4'), -400);
  assert.equal(U.parseMoney(''), null);
  assert.equal(U.parseMoney('abc'), null);
  assert.equal(U.parseMoney('1.2.3'), null);
  assert.equal(U.parseMoney(null), null);
});

test('money formats consistently within a mode', () => {
  assert.equal(U.formatMoney(123456), '£1,234.56');
  assert.equal(U.formatMoney(-123456), '-£1,234.56');
  assert.equal(U.formatMoney(1250, { plus: true }), '+£12.50');
  assert.equal(U.formatMoney(0, { plus: true }), '£0.00');
  // Compact must stay compact below the 'k' threshold, or one row of
  // figures ends up in two different formats.
  assert.equal(U.formatMoney(70170, { compact: true }), '£702');
  assert.equal(U.formatMoney(130000, { compact: true }), '£1.3k');
  assert.equal(U.formatMoney(1234567, { round: true }), '£12,346');
});

test('correlation refuses to answer on thin or flat data', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.ok(U.correlation(xs, xs) > 0.99);
  assert.ok(U.correlation(xs, xs.slice().reverse()) < -0.99);
  assert.equal(U.correlation([1, 2, 3], [1, 2, 3]), null, 'sample too small');
  assert.equal(U.correlation(xs, xs.map(() => 5)), null, 'flat series has no direction');
});

test('median and stdev handle the awkward cases', () => {
  assert.equal(U.median([3, 1, 2]), 2);
  assert.equal(U.median([4, 1, 2, 3]), 2.5);
  assert.equal(U.median([]), null);
  assert.equal(U.stdev([5]), null);
  assert.ok(Math.abs(U.stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});

test('relativeDay reads the way a person would say it', () => {
  const t = '2026-09-10';
  assert.equal(U.relativeDay('2026-09-10', t), 'today');
  assert.equal(U.relativeDay('2026-09-11', t), 'tomorrow');
  assert.equal(U.relativeDay('2026-09-09', t), 'yesterday');
  assert.equal(U.relativeDay('2026-09-03', t), '7 days ago');
  assert.equal(U.relativeDay('2026-09-14', t), 'in 4 days');
});
