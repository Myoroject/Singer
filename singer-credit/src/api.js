'use strict';
// Shared application API. The desktop (Electron) and browser builds both call this;
// only storage, the SOP source and CSV export differ, and those come in as `platform`.
const E = require('./engine');
const { seed } = require('./seed');
const { LABELS } = require('./i18n');
const { diffDays } = require('./util');

const READ_ONLY = ['state', 'dashboard', 'customers', 'loans', 'loan', 'queue', 'audit', 'outbox', 'applications',
  'policyVersions', 'ifsPostings', 'customerDocs', 'quote', 'precheck', 'disbursements', 'sop'];

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

function createApi(platform) {
  let state = null;

  const loanView = l => {
    const out = E.loanOutstanding(l);
    const dpd = E.dpdOf(l, state.clock);
    const next = l.schedule && l.schedule.rows.find(r => r.due >= state.clock && E.rowOwed(r) > 0.005);
    const c = state.customers[l.nic];
    return Object.assign({}, l, {
      customer: { name: c.name, nic: c.nic, phone: c.phone, email: c.email },
      outstanding: out, dpd, customerName: c.name,
      bucket: dpd ? E.bucketOf(E.pol(state), dpd) : 'Current',
      nextDue: next ? { due: next.due, amount: E.rowOwed(next) } : null
    });
  };

  const handlers = {
    state: () => ({ clock: state.clock, policy: E.pol(state), promos: state.promos, labels: LABELS, platform: platform.name }),
    dashboard: () => E.reports(state),
    customers: () => Object.values(state.customers).map(c => Object.assign({}, c, { exposure: E.exposure(state, c.nic) })),
    customerDocs: nic => state.demoDocs && state.demoDocs[nic],
    precheck: (nic, category, price) => {
      const c = state.customers[nic];
      const r = E.eligibility(state, nic, { category, price });
      return { customer: { name: c.name, nic: c.nic, dob: c.dob, tier: c.tier, ekyc: c.ekyc, bank: c.bank, limitStatus: c.limitStatus }, checks: r.checks };
    },
    disbursements: () => {
      const out = [];
      for (const l of Object.values(state.loans)) {
        const posting = state.ifsPostings.find(x => x.type === 'DISBURSEMENT_TO_SINGER' && x.loan === l.id);
        let stage = null;
        if (posting) stage = 'released'; else if (l.status === 'signed') stage = 'pending_delivery'; else if (l.status === 'approved') stage = 'awaiting_signature';
        if (!stage) continue;
        out.push({ loan: l.id, customer: state.customers[l.nic].name, order: l.order.id, product: l.product, amount: l.principal, downPayment: l.downPayment, stage, date: posting ? posting.at : null, reference: posting ? 'DSB-' + l.id : '', agreementRef: l.agreement && l.agreement.docRef });
      }
      return out.reverse();
    },
    sop: () => platform.readSop(),
    registerCustomer: input => E.registerCustomer(state, input, 'onboarding.api'),
    assessLimit: (nic, docs) => E.assessLimit(state, nic, docs, 'credit.officer'),
    limitAction: (nic, action) => E.setLimit(state, nic, action, 'credit.officer'),
    quote: input => {
      const c = state.customers[input.nic];
      const prev = c.tier;
      const r = E.scoreCustomer(state, input.nic, input.docs || {});
      c.tier = r.tier;
      try { return Object.assign(E.quote(state, input), { assessment: r }); } finally { c.tier = prev; }
    },
    apply: input => E.createApplication(state, input, 'singer.website'),
    applications: () => Object.values(state.applications).reverse(),
    decide: (id, d) => E.manualDecision(state, id, d),
    loans: () => Object.values(state.loans).map(loanView).reverse(),
    loan: id => loanView(state.loans[id]),
    agreement: (id, lang) => E.generateAgreement(state, id, lang),
    sign: id => E.recordSigned(state, id),
    orderEvent: (id, ev, opts) => E.orderEvent(state, id, ev, opts),
    pay: (id, p) => E.postPayment(state, id, p, 'ops.user'),
    reverse: (id, payId, approver, reason) => E.reversePayment(state, id, payId, approver, reason),
    settleQuote: id => E.settlementQuote(state, id),
    settle: (id, q) => E.settleLoan(state, id, q),
    partial: (id, amt) => E.partialSettle(state, id, amt),
    returnGoods: (id, v, approver, reason) => E.returnGoods(state, id, v, approver, reason),
    cancel: id => E.cancelLoan(state, id, 'cancelled by operator'),
    dueDate: (id, day, approver) => E.changeDueDate(state, id, day, approver),
    waive: (id, no, amt, approver, reason) => E.waivePenalty(state, id, no, amt, approver, reason),
    queue: () => E.collectionQueue(state),
    contact: (id, c) => E.recordContact(state, id, c),
    ptp: (id, c) => E.recordPTP(state, id, c),
    restructure: (id, m, approver, reason) => E.restructure(state, id, m, approver, reason),
    writeOff: (id, approver, reason) => E.writeOff(state, id, approver, reason),
    advance: days => E.advanceDays(state, days),
    updatePolicy: (patch, effective) => E.updatePolicy(state, patch, effective, 'policy.admin'),
    policyVersions: () => state.policy.versions,
    audit: () => state.audit.slice().reverse().slice(0, 500),
    outbox: () => state.outbox.slice().reverse().slice(0, 300),
    ifsPostings: () => state.ifsPostings.slice().reverse(),
    reset: () => { state = seed(todayISO()); return true; },
    exportCsv: (name, rows) => {
      const keys = rows.length ? Object.keys(rows[0]) : [];
      const esc = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
      const csv = [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
      return platform.exportCsv(`${name}-${state.clock}.csv`, csv);
    }
  };

  return {
    init() {
      const stored = platform.loadState();
      state = stored || seed(todayISO());
      // The system date is always today. Run the daily batch for any days the app was closed.
      const gap = diffDays(todayISO(), state.clock);
      if (gap > 0) E.advanceDays(state, Math.min(gap, 400));
      platform.saveState(state);
    },
    call(method, args) {
      const fn = handlers[method];
      if (!fn) return { error: 'Unknown method ' + method };
      try {
        const result = fn(...(args || []));
        if (!READ_ONLY.includes(method)) platform.saveState(state);
        return { result: JSON.parse(JSON.stringify(result === undefined ? null : result)) };
      } catch (e) { return { error: e.message }; }
    }
  };
}

module.exports = { createApi, todayISO };
