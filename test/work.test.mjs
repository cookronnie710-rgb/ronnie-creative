import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core } from './helpers.mjs';

const { Util: U, Model: M, Work: W } = core();
const TODAY = '2026-09-10';

function base() {
  const s = M.defaultState();
  s.settings.followUpDays = 10;
  return s;
}

test('applications go quiet after the follow-up window', () => {
  const s = base();
  s.applications = [
    M.application({ company: 'Old', appliedDate: U.addDays(TODAY, -21) }),
    M.application({ company: 'Recent', appliedDate: U.addDays(TODAY, -3) })
  ];
  const quiet = W.needsFollowUp(s, TODAY);
  assert.equal(quiet.length, 1);
  assert.equal(quiet[0].application.company, 'Old');
  assert.equal(quiet[0].silentDays, 21);
});

test('contact and scheduled next steps both silence the nudge', () => {
  const s = base();
  s.applications = [
    M.application({
      company: 'Contacted', appliedDate: U.addDays(TODAY, -30),
      lastContact: U.addDays(TODAY, -2)
    }),
    M.application({
      company: 'Scheduled', appliedDate: U.addDays(TODAY, -30),
      nextAction: 'Interview', nextActionDate: U.addDays(TODAY, 3)
    }),
    M.application({ company: 'Lead', status: 'lead', appliedDate: U.addDays(TODAY, -30) })
  ];
  assert.deepEqual(W.needsFollowUp(s, TODAY), [],
    'nothing here is actually waiting on a nudge');
});

test('closed applications drop out of the live pipeline', () => {
  const s = base();
  s.applications = [
    M.application({ company: 'Live', status: 'interview', salaryPence: 3000000 }),
    M.application({ company: 'Gone', status: 'rejected', salaryPence: 3000000 })
  ];
  const pv = W.pipelineValue(s);
  assert.equal(pv.applications.count, 1);
  assert.equal(pv.applications.totalPence, 3000000);
  // Weighted by stage: an interview is not a salary.
  assert.equal(pv.applications.expectedPence, 1350000);
  assert.ok(pv.applications.expectedPence < pv.applications.totalPence);
});

test('response rate only counts applications old enough to have heard back', () => {
  const s = base();
  s.applications = [
    M.application({ company: 'A', status: 'interview', appliedDate: U.addDays(TODAY, -20) }),
    M.application({ company: 'B', status: 'applied', appliedDate: U.addDays(TODAY, -20) }),
    M.application({ company: 'C', status: 'applied', appliedDate: U.addDays(TODAY, -1) })
  ];
  const rr = W.responseRate(s, TODAY);
  assert.equal(rr.sample, 2, 'yesterday’s application is not a silence');
  assert.equal(rr.responded, 1);
  assert.equal(rr.pct, 50);
});

test('unpaid work is counted from what is still outstanding', () => {
  const s = base();
  s.gigs = [
    M.gig({ client: 'A', status: 'delivered', quotedPence: 50000, paidPence: 0 }),
    M.gig({ client: 'B', status: 'in_progress', quotedPence: 30000, paidPence: 10000 }),
    M.gig({ client: 'C', status: 'paid', quotedPence: 20000, paidPence: 20000 })
  ];
  const owed = W.unpaid(s);
  assert.equal(owed.totalPence, 70000);
  assert.equal(owed.items.length, 2);
  assert.equal(owed.items[0].gig.client, 'A', 'largest first');
});

test('overdue work excludes anything already delivered', () => {
  const s = base();
  s.gigs = [
    M.gig({ client: 'Late', status: 'in_progress', dueDate: U.addDays(TODAY, -3) }),
    M.gig({ client: 'Handed over', status: 'delivered', dueDate: U.addDays(TODAY, -3) }),
    M.gig({ client: 'Fine', status: 'in_progress', dueDate: U.addDays(TODAY, 3) })
  ];
  const late = W.overdueGigs(s, TODAY);
  assert.equal(late.length, 1);
  assert.equal(late[0].gig.client, 'Late');
  assert.equal(late[0].overdueDays, 3);
});

test('realised hourly rate uses finished, paid work only', () => {
  const s = base();
  s.gigs = [
    M.gig({ status: 'paid', paidPence: 40000, hoursLogged: 10 }),
    M.gig({ status: 'paid', paidPence: 20000, hoursLogged: 10 }),
    M.gig({ status: 'in_progress', quotedPence: 90000, hoursLogged: 1 })
  ];
  const rate = W.effectiveRate(s);
  assert.equal(rate.jobs, 2);
  assert.equal(rate.pencePerHour, 3000, '£600 across 20 hours');
});

test('estimate accuracy stays quiet until there are enough finished jobs', () => {
  const s = base();
  s.gigs = [
    M.gig({ status: 'paid', hoursEstimate: 10, hoursLogged: 15 }),
    M.gig({ status: 'paid', hoursEstimate: 10, hoursLogged: 12 })
  ];
  assert.equal(W.estimateAccuracy(s), null, 'two jobs is not a pattern');

  s.gigs.push(M.gig({ status: 'delivered', hoursEstimate: 10, hoursLogged: 20 }));
  const acc = W.estimateAccuracy(s);
  assert.equal(acc.jobs, 3);
  assert.equal(acc.medianRatio, 1.5);
});

test('due actions collect overdue work from both pipelines', () => {
  const s = base();
  s.applications = [M.application({
    company: 'Acme', status: 'applied',
    nextAction: 'Chase', nextActionDate: U.addDays(TODAY, -2)
  })];
  s.gigs = [M.gig({ client: 'Client', status: 'in_progress', dueDate: TODAY })];
  const due = W.dueActions(s, TODAY);
  assert.equal(due.length, 2);
  assert.equal(due[0].kind, 'application', 'oldest first');
  assert.equal(due[0].overdueDays, 2);
  assert.equal(due[1].overdueDays, 0);
});
