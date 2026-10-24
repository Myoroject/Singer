'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const E = require('./src/engine');
const { seed } = require('./src/seed');
const { LABELS } = require('./src/i18n');

let state;
let statePath;

function load() {
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { state = seed(); save(); }
}
function save() { fs.writeFileSync(statePath, JSON.stringify(state)); }

const loanView = l => {
  const out = E.loanOutstanding(l);
  const dpd = E.dpdOf(l, state.clock);
  const next = l.schedule && l.schedule.rows.find(r => r.due >= state.clock && E.rowOwed(r) > 0.005);
  return Object.assign({}, l, { outstanding: out, dpd, customerName: state.customers[l.nic].name, bucket: dpd ? E.bucketOf(E.pol(state), dpd) : 'Current', nextDue: next ? { due: next.due, amount: E.rowOwed(next) } : null });
};

const handlers = {
  state: () => ({ clock: state.clock, policy: E.pol(state), promos: state.promos, labels: LABELS }),
  dashboard: () => E.reports(state),
  customers: () => Object.values(state.customers).map(c => Object.assign({}, c, { exposure: E.exposure(state, c.nic) })),
  customerDocs: nic => state.demoDocs && state.demoDocs[nic],
  registerCustomer: input => E.registerCustomer(state, input, 'onboarding.api'),
  assessLimit: (nic, docs) => E.assessLimit(state, nic, docs, 'credit.officer'),
  limitAction: (nic, action) => E.setLimit(state, nic, action, 'credit.officer'),
  quote: input => {
    const c = state.customers[input.nic];
    const prev = { tier: c.tier, limitStatus: c.limitStatus };
    const r = E.scoreCustomer(state, input.nic, input.docs || {});
    c.tier = r.tier;
    try { return Object.assign(E.quote(state, input), { assessment: r }); } finally { c.tier = prev.tier; }
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
  reset: () => { state = seed(); return true; },
  exportCsv: (name, rows) => {
    const dir = path.join(app.getPath('documents'), 'SINGER-Credit-Exports');
    fs.mkdirSync(dir, { recursive: true });
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const esc = v => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    const file = path.join(dir, `${name}-${state.clock}.csv`);
    fs.writeFileSync(file, [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n'));
    return file;
  }
};

ipcMain.handle('api', (_e, method, args) => {
  const fn = handlers[method];
  if (!fn) return { error: 'Unknown method ' + method };
  try {
    const result = fn(...(args || []));
    if (!['state', 'dashboard', 'customers', 'loans', 'loan', 'queue', 'audit', 'outbox', 'applications', 'policyVersions', 'ifsPostings', 'customerDocs', 'quote'].includes(method)) save();
    return { result: JSON.parse(JSON.stringify(result === undefined ? null : result)) };
  } catch (e) { return { error: e.message }; }
});

app.whenReady().then(() => {
  statePath = path.join(app.getPath('userData'), 'singer-credit-state.json');
  if (process.env.SINGER_FRESH) { try { fs.unlinkSync(statePath); } catch (e) { /* none */ } }
  load();
  const win = new BrowserWindow({ width: 1440, height: 900, title: 'SINGER CREDIT - Loan Management', backgroundColor: '#0f1115', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
