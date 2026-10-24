'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine');
const { seed } = require('../src/seed');
const { parseNic } = require('../src/util');

const docsA = { monthlyIncome: 180000, monthlyObligations: 20000, salaryMonthsRegular: 6, tamperRisk: 5 };
function fresh() {
  const s = E.newState('2026-10-24');
  s.promos = [{ code: 'ZERO6', from: '2026-01-01', to: '2026-12-31', products: ['Electronics'], tenors: [6], annualFlatOverride: 0, feeWaived: true }];
  E.registerCustomer(s, { nic: '856234567V', name: 'T One', ifs: { onTimePayments: 10, purchases: 4 } });
  E.assessLimit(s, '856234567V', docsA);
  return s;
}
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);

test('NIC parsing derives DOB and gender', () => {
  assert.deepStrictEqual(parseNic('856234567V').gender, 'F');
  assert.strictEqual(parseNic('199012345678').dob, '1990-05-02');
  assert.strictEqual(parseNic('123'), null);
});

test('schedule totals equal loan total and instalments equal the quote', () => {
  const s = fresh();
  const o = E.priceOption(s, { cashPrice: 120000, downPayment: 20000, product: 'Electronics', tier: 'A', tenor: 12 });
  assert.strictEqual(o.principal, 100000);
  assert.strictEqual(o.charge, 12000); // 12% flat for 12 months
  const { loan } = E.createApplication(s, { nic: '856234567V', product: 'Electronics', cashPrice: 120000, downPayment: 20000, tenor: 12, docs: docsA });
  const rows = loan.schedule.rows;
  assert.strictEqual(rows.length, 12);
  assert.ok(Math.abs(sum(rows, 'principal') - loan.principal) < 0.01);
  assert.ok(Math.abs(sum(rows, 'charge') - loan.charge) < 0.01);
  assert.ok(Math.abs(rows.reduce((t, r) => t + E.rowBase(r), 0) - loan.total) < 0.01);
  assert.strictEqual(E.rowBase(rows[0]), loan.instalment);
});

test('no loan proceeds without a signed agreement', () => {
  const s = fresh();
  const { loan } = E.createApplication(s, { nic: '856234567V', product: 'Electronics', cashPrice: 120000, downPayment: 20000, tenor: 6, docs: docsA });
  assert.throws(() => E.orderEvent(s, loan.id, 'delivered'), /signed agreement/);
  E.generateAgreement(s, loan.id); E.recordSigned(s, loan.id);
  E.orderEvent(s, loan.id, 'delivered');
  assert.strictEqual(loan.status, 'active');
});

test('exposure includes HP, CREDIT and reserved pending orders; hard block above limit', () => {
  const s = fresh();
  s.customers['856234567V'].ifs.hpOutstanding = 500000;
  const { app } = E.createApplication(s, { nic: '856234567V', product: 'Electronics', cashPrice: 200000, downPayment: 0, tenor: 12, docs: docsA });
  assert.strictEqual(app.status, 'declined');
  assert.ok(app.declineReasons.some(r => r.includes('Sufficient available credit exposure')));
  s.customers['856234567V'].ifs.hpOutstanding = 0;
  const first = E.createApplication(s, { nic: '856234567V', product: 'Electronics', cashPrice: 250000, downPayment: 0, tenor: 12, docs: docsA });
  assert.ok(first.loan);
  assert.ok(E.exposure(s, '856234567V').reserved > 250000);
  const second = E.createApplication(s, { nic: '856234567V', product: 'Electronics', cashPrice: 330000, downPayment: 0, tenor: 12, docs: docsA });
  assert.strictEqual(second.app.status, 'declined'); // pending order reserved the limit
  E.cancelLoan(s, first.loan.id, 'test');
  assert.strictEqual(E.exposure(s, '856234567V').reserved, 0);
});

test('payment allocation: penalty, then oldest due first; overpayment goes to next instalment', () => {
  const s = seed();
  const id = 'LN-1002';
  const loan = s.loans[id];
  const before = E.loanOutstanding(loan);
  const pay = E.postPayment(s, id, { amount: 20000, channel: 'branch' });
  assert.strictEqual(pay.allocations[0].comp, 'penalty');
  assert.strictEqual(pay.allocations[0].no, 1);
  assert.ok(Math.abs(before - E.loanOutstanding(loan) - 20000) < 0.01);
});

test('late fee and penal interest accrue after grace, capped', () => {
  const s = seed();
  const loan = s.loans['LN-1002'];
  const r = loan.schedule.rows[0];
  const cap = Math.max(500, E.rowBase(r) * 0.25);
  assert.ok(r.penalty >= 500 && r.penalty <= cap + 0.01);
  assert.strictEqual(loan.status, 'in_arrears');
});

test('arrears freezes the limit automatically at policy DPD', () => {
  const s = seed();
  assert.strictEqual(s.customers['883127123V'].limitStatus, 'frozen');
});

test('early settlement quote rebates unearned charge and closes the loan', () => {
  const s = seed();
  const q = E.settlementQuote(s, 'LN-1000');
  assert.ok(q.breakdown.unearnedChargeRebate > 0);
  assert.ok(q.amount < E.loanOutstanding(s.loans['LN-1000']));
  E.settleLoan(s, 'LN-1000', q.id);
  assert.strictEqual(s.loans['LN-1000'].status, 'settled');
  assert.strictEqual(E.loanOutstanding(s.loans['LN-1000']), 0);
});

test('expired settlement quote is rejected', () => {
  const s = seed();
  const q = E.settlementQuote(s, 'LN-1000');
  E.advanceDays(s, 10);
  assert.throws(() => E.settleLoan(s, 'LN-1000', q.id), /expired/);
});

test('goods return recalculates the schedule and restores limit', () => {
  const s = seed();
  const loan = s.loans['LN-1000'];
  const exBefore = E.exposure(s, loan.nic).credit;
  const res = E.returnGoods(s, 'LN-1000', 50000, 'ops.checker', 'faulty item');
  assert.ok(res.revisedInstalment < 18840);
  assert.ok(E.exposure(s, loan.nic).credit < exBefore);
  assert.ok(loan.scheduleHistory.length >= 2);
});

test('restructure needs approval and keeps the outstanding balance', () => {
  const s = seed();
  assert.throws(() => E.restructure(s, 'LN-1002', 3), /approval/);
  const before = E.loanOutstanding(s.loans['LN-1002']);
  E.restructure(s, 'LN-1002', 3, 'collections.head', 'hardship');
  assert.ok(Math.abs(E.loanOutstanding(s.loans['LN-1002']) - before) < 0.01);
});

test('waiver and write-off require approval; audit trail records before/after', () => {
  const s = seed();
  assert.throws(() => E.waivePenalty(s, 'LN-1002', 1, 100), /approval/);
  const n = s.audit.length;
  E.waivePenalty(s, 'LN-1002', 1, 100, 'manager', 'goodwill');
  const rec = s.audit[n];
  assert.strictEqual(rec.action, 'penalty.waive');
  assert.ok(rec.before && rec.after);
  assert.throws(() => E.writeOff(s, 'LN-1002'), /approval/);
});

test('manual approval authority is enforced', () => {
  const s = seed();
  const r = E.createApplication(s, { nic: '883127123V', product: 'Electronics', cashPrice: 100000, downPayment: 0, tenor: 6, docs: s.demoDocs['883127123V'] });
  assert.strictEqual(r.app.status, 'declined'); // frozen limit
});

test('versioned policy rejects values above system caps', () => {
  const s = fresh();
  assert.throws(() => E.updatePolicy(s, { lateFee: 5000 }, '2026-11-01', 'admin'), /cap/);
  E.updatePolicy(s, { graceDays: 7 }, '2026-11-01', 'admin');
  assert.strictEqual(E.pol(s).graceDays, 5); // not yet effective
  s.clock = '2026-11-02';
  assert.strictEqual(E.pol(s).graceDays, 7);
});
