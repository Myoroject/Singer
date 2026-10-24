'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lkr = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lkr0 = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

let S = { clock: '', policy: null, lang: 'en', view: 'dashboard', loanId: null, draft: null };

async function api(method, ...args) {
  const r = await window.singer.call(method, ...args);
  if (r.error) { toast(r.error, true); throw new Error(r.error); }
  return r.result;
}
function toast(msg, err) {
  const el = document.createElement('div');
  if (err) el.className = 'err';
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}
const tag = (t, cls) => `<span class="tag ${cls || ''}">${esc(t)}</span>`;
const statusTag = s => tag(s.replace('_', ' '), { active: 'ok', settled: 'ok', approved: 'info', signed: 'info', referred: 'warn', in_arrears: 'bad', declined: 'bad', cancelled: '', written_off: 'bad', new: '' }[s] || '');

const NAV = [
  ['dashboard', 'Dashboard'], ['apply', 'New application'], ['queue', 'Underwriter queue'], ['loans', 'Loans'],
  ['collections', 'Collections'], ['customers', 'Customers & limits'], ['reports', 'Reports'], ['policy', 'Policy & pricing'], ['audit', 'Audit & notifications']
];

async function refreshChrome() {
  const st = await api('state');
  S.clock = st.clock; S.policy = st.policy; S.promos = st.promos; S.labels = st.labels;
  $('#clock').textContent = S.clock;
  const dash = await api('dashboard');
  $('#nav').innerHTML = NAV.map(([k, t]) => `<button data-nav="${k}" class="${S.view === k || (k === 'loans' && S.view === 'loan') ? 'on' : ''}">${t}${k === 'queue' && dash.counts.referred ? `<span class="badge">${dash.counts.referred}</span>` : ''}${k === 'collections' && dash.counts.arrears ? `<span class="badge">${dash.counts.arrears}</span>` : ''}</button>`).join('');
  $('#langSwitch').innerHTML = [['en', 'EN'], ['si', 'සිං'], ['ta', 'தமிழ்']].map(([k, t]) => `<button data-lang="${k}" class="${S.lang === k ? 'on' : ''}">${t}</button>`).join('');
}

async function go(view, extra) {
  S.view = view;
  if (extra !== undefined) S.loanId = extra;
  await refreshChrome();
  const v = VIEWS[view];
  $('#view').innerHTML = await v();
  if (AFTER[view]) AFTER[view]();
}

function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }

// ----------------------------------------------------------------- views
const VIEWS = {};
const AFTER = {};

VIEWS.dashboard = async () => {
  const r = await api('dashboard');
  const maxAge = Math.max(1, ...Object.values(r.ageing));
  const tot = r.hpVsCredit.hp + r.hpVsCredit.credit || 1;
  return `<h1>Dashboard</h1><p class="sub">Portfolio position as of ${S.clock}</p>
  <div class="grid g4">
    <div class="card kpi"><small>Active loans</small><b>${r.counts.active}</b><i>${r.counts.arrears} in arrears · ${r.counts.loans} total</i></div>
    <div class="card kpi"><small>Disbursed to SINGER</small><b>LKR ${lkr0(r.disbursed)}</b><i>Proceeds go directly against orders</i></div>
    <div class="card kpi"><small>CREDIT outstanding</small><b>LKR ${lkr0(r.outstanding)}</b><i>Discounts given LKR ${lkr0(r.discounts)}</i></div>
    <div class="card kpi"><small>Awaiting underwriter</small><b>${r.counts.referred}</b><i>${r.counts.referred ? 'SLA timers running' : 'Queue clear'}</i></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>Arrears ageing (outstanding LKR)</h2>${Object.entries(r.ageing).map(([k, v]) => `<div class="row" style="margin:7px 0"><span style="width:70px">${esc(k)}</span><div class="bar sp"><i style="width:${v / maxAge * 100}%;${k === 'Current' ? 'background:var(--ok)' : ''}"></i></div><span style="width:110px;text-align:right">${lkr0(v)}</span></div>`).join('')}</div>
    <div class="card"><h2>Total exposure: SINGER HP vs SINGER CREDIT</h2>
      <div class="bar" style="height:18px"><i style="width:${r.hpVsCredit.hp / tot * 100}%;background:var(--info)"></i></div>
      <div class="row" style="margin-top:8px"><span>${tag('HP', 'info')} LKR ${lkr0(r.hpVsCredit.hp)}</span><span class="sp"></span><span>${tag('CREDIT', 'ok')} LKR ${lkr0(r.hpVsCredit.credit)}</span></div>
      <h2 style="margin-top:18px">Decisions by risk tier</h2>
      <table><tr><th>Tier</th><th class="r">Approved</th><th class="r">Referred</th><th class="r">Declined</th></tr>${Object.entries(r.byTier).sort().map(([t, v]) => `<tr><td>${t}</td><td class="r">${v.approved}</td><td class="r">${v.referred}</td><td class="r">${v.declined}</td></tr>`).join('')}</table></div>
  </div>`;
};

VIEWS.apply = async () => {
  const customers = await api('customers');
  const d = S.draft || {};
  const nic = d.nic || customers[0].nic;
  const docs = (await api('customerDocs', nic)) || {};
  const prods = Object.keys(S.policy.products);
  return `<h1>New application</h1><p class="sub">Simulates the call the SINGER website makes at checkout: quote plans, then submit for an instant decision.</p>
  <div class="card"><div class="form">
    <div><label>Customer (NIC)</label><select id="f-nic">${customers.map(c => `<option value="${c.nic}" ${c.nic === nic ? 'selected' : ''}>${esc(c.name)} · ${c.nic} · tier ${c.tier || '-'} · ${c.limitStatus}</option>`).join('')}</select></div>
    <div><label>Product category</label><select id="f-prod">${prods.map(p => `<option ${p === (d.product || 'Electronics') ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div><label>Cash price (LKR)</label><input id="f-price" type="number" value="${d.cashPrice || 150000}"></div>
    <div><label>Down payment (LKR)</label><input id="f-down" type="number" value="${d.downPayment !== undefined ? d.downPayment : 15000}"></div>
    <div><label>Promo code (ZERO6, FEST5)</label><input id="f-promo" value="${esc(d.promoCode || '')}" placeholder="optional"></div>
    <div><label>Order reference</label><input id="f-order" value="${esc(d.orderId || 'ORD-' + Math.floor(90000 + Math.random() * 9000))}"></div>
    <div class="w3"><h2 style="margin-top:6px">Financial documents (as extracted by OCR / statement parsing)</h2></div>
    <div><label>Monthly income</label><input id="f-inc" type="number" value="${docs.monthlyIncome || 100000}"></div>
    <div><label>Monthly obligations</label><input id="f-obl" type="number" value="${docs.monthlyObligations || 20000}"></div>
    <div><label>Salary regular months (of 6)</label><input id="f-reg" type="number" min="0" max="6" value="${docs.salaryMonthsRegular !== undefined ? docs.salaryMonthsRegular : 6}"></div>
    <div><label>Tamper risk score (0-100)</label><input id="f-tam" type="number" min="0" max="100" value="${docs.tamperRisk !== undefined ? docs.tamperRisk : 5}"></div>
    <div><label>Guarantor NIC (if required)</label><input id="f-gnic" placeholder="e.g. 856234567V" value="${esc(d.gnic || '')}"></div>
    <div><label>Guarantor relationship</label><input id="f-grel" value="${esc(d.grel || 'Spouse')}"></div>
  </div>
  <div class="row" style="margin-top:14px"><button class="pri" data-act="quote">Get plan options</button><span class="muted">Plans are shown in English, Sinhala or Tamil using the language switch above.</span></div></div>
  <div id="quote-out" style="margin-top:14px"></div>`;
};
AFTER.apply = () => { $('#f-nic').onchange = async () => { S.draft = Object.assign(S.draft || {}, { nic: $('#f-nic').value }); await go('apply'); }; };

function readDraft() {
  return {
    nic: $('#f-nic').value, product: $('#f-prod').value, cashPrice: +$('#f-price').value, downPayment: +$('#f-down').value, promoCode: $('#f-promo').value.trim(), orderId: $('#f-order').value,
    docs: { monthlyIncome: +$('#f-inc').value, monthlyObligations: +$('#f-obl').value, salaryMonthsRegular: +$('#f-reg').value, tamperRisk: +$('#f-tam').value },
    gnic: $('#f-gnic').value.trim(), grel: $('#f-grel').value
  };
}

async function doQuote() {
  const d = readDraft();
  S.draft = d;
  const q = await api('quote', { nic: d.nic, product: d.product, cashPrice: d.cashPrice, downPayment: d.downPayment, promoCode: d.promoCode, docs: d.docs });
  S.lastQuote = q;
  const warn = q.notes.map(n => tag(n, 'bad')).join(' ');
  const opts = q.options.map(o => {
    const ok = o.withinProductLimits && o.withinCreditLimit && q.downPaymentOk;
    return `<div class="opt ${ok ? '' : 'off'}" data-act="pick" data-tenor="${o.tenor}"><h3>${o.tenor} ${esc(S.labels[S.lang].months)} ${o.promo ? tag(o.promo, 'ok') : ''}</h3>
      <dl>${o.labels[S.lang].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div style="margin-top:8px">${o.withinProductLimits ? '' : tag('Outside product limits', 'bad')} ${o.withinCreditLimit ? '' : tag('Exceeds available credit', 'bad')}</div></div>`;
  }).join('');
  $('#quote-out').innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">Plan options</h2>${tag('Risk tier ' + q.tier, 'info')}${tag('Score ' + q.assessment.score)}<span class="sp"></span>${warn}</div>
    <p class="muted">Minimum down payment for this tier: LKR ${lkr(q.minDownPayment)}.</p>
    <div class="grid g3">${opts || '<p>No tenors available for this risk tier.</p>'}</div>
    <div class="row" style="margin-top:14px"><button class="pri" data-act="submit-app" ${q.options.length ? '' : 'disabled'}>Submit with selected plan</button><span class="muted" id="picked">Select a plan above</span></div></div>`;
}

async function doSubmit() {
  const d = S.draft;
  if (!d.tenor) return toast('Select a plan first', true);
  const input = { nic: d.nic, product: d.product, cashPrice: d.cashPrice, downPayment: d.downPayment, promoCode: d.promoCode || null, tenor: d.tenor, orderId: d.orderId, docs: d.docs, lang: S.lang };
  if (d.gnic) input.guarantor = { nic: d.gnic, relationship: d.grel, consent: true };
  const r = await api('apply', input);
  const a = r.app;
  const checks = a.explain.rules.map(c => `<li><span class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✔' : '✘'}</span> <b>${esc(c.rule)}</b> <span class="muted">${esc(c.detail)}</span></li>`).join('');
  const factors = a.explain.scorecard.map(f => `<tr><td>${esc(f.factor)}</td><td class="muted">${esc(f.detail)}</td><td class="r">${f.points} / ${f.max}</td></tr>`).join('');
  const outcome = a.status === 'approved' ? tag('AUTO-APPROVED', 'ok') : a.status === 'referred' ? tag('REFERRED FOR MANUAL REVIEW', 'warn') : tag('DECLINED', 'bad');
  const reasons = (a.declineReasons || a.referReasons || []).map(x => `<li>${esc(x)}</li>`).join('');
  modal(`<div class="row"><h2 style="margin:0">Decision ${esc(a.id)}</h2>${outcome}<span class="sp"></span><button data-act="close">Close</button></div>
    ${reasons ? `<ul>${reasons}</ul>` : ''}
    <h2 style="margin-top:12px">Explainability record</h2><ul class="checks">${checks}</ul>
    <table style="margin-top:10px"><tr><th>Scorecard factor</th><th>Evidence</th><th class="r">Points</th></tr>${factors}<tr><td><b>Total</b></td><td>Tier ${a.explain.tier}</td><td class="r"><b>${a.explain.score}</b></td></tr></table>
    <div class="row" style="margin-top:14px">${r.loan ? `<button class="pri" data-act="open-loan" data-id="${r.loan.id}">Open loan ${r.loan.id}</button>` : a.status === 'referred' ? `<button class="pri" data-act="nav" data-view="queue">Go to underwriter queue</button>` : ''}</div>`);
  await refreshChrome();
}

VIEWS.queue = async () => {
  const apps = (await api('applications')).filter(a => a.status === 'referred');
  return `<h1>Underwriter queue</h1><p class="sub">Referred applications with approval authority and SLA timers.</p>
  ${apps.length ? apps.map(a => `<div class="card" style="margin-bottom:12px"><div class="row"><b>${esc(a.id)}</b>${tag(a.product)}<span>NIC ${esc(a.nic)}</span><span class="sp"></span>${tag('SLA ' + a.sla.hours + 'h · from ' + a.createdAt, 'warn')}</div>
    <p>Loan LKR ${lkr(a.option.principal)} over ${a.option.tenor} months · tier ${a.explain.tier} · score ${a.explain.score}</p>
    <ul>${a.referReasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <div class="row"><select id="role-${a.id}" style="width:230px"><option value="underwriter">Underwriter (up to ${lkr0(S.policy.approvalAuthority.underwriter)})</option><option value="senior_underwriter">Senior underwriter (up to ${lkr0(S.policy.approvalAuthority.senior_underwriter)})</option></select>
    <input id="note-${a.id}" placeholder="Decision note" style="width:260px"><button class="pri" data-act="decide" data-id="${a.id}" data-d="approve">Approve</button><button data-act="decide" data-id="${a.id}" data-d="decline">Decline</button></div></div>`).join('') : '<div class="card muted">No applications are waiting. Submit a Tier C customer or one with suspected document tampering (Sampath Kumara) to see a referral.</div>'}`;
};

VIEWS.loans = async () => {
  const loans = await api('loans');
  return `<h1>Loans</h1><p class="sub">${loans.length} loans</p><div class="card"><table><tr><th>Loan</th><th>Customer</th><th>Product</th><th>Status</th><th class="r">Principal</th><th class="r">Outstanding</th><th>Next due</th><th class="r">DPD</th></tr>
  ${loans.map(l => `<tr class="click" data-act="open-loan" data-id="${l.id}"><td><b>${l.id}</b></td><td>${esc(l.customerName)}</td><td>${esc(l.product)}</td><td>${statusTag(l.status)}</td><td class="r">${lkr0(l.principal)}</td><td class="r">${lkr0(l.outstanding)}</td><td>${l.nextDue ? l.nextDue.due + ' · ' + lkr0(l.nextDue.amount) : '-'}</td><td class="r">${l.dpd || ''}</td></tr>`).join('')}</table></div>`;
};

VIEWS.loan = async () => {
  const l = await api('loan', S.loanId);
  const p = S.policy;
  const steps = ['applied', 'approved', 'signed', 'active', 'settled'];
  const reached = new Set(l.timeline.map(t => t.status));
  const curIdx = ['approved', 'signed', 'active', 'in_arrears', 'settled'].indexOf(l.status);
  const stepper = steps.map(s => `<span class="${reached.has(s) ? 'done' : ''}">${s}</span>`).join('') + (l.status === 'in_arrears' ? tag('in arrears', 'bad') : '') + (['cancelled', 'written_off'].includes(l.status) ? statusTag(l.status) : '');
  const rows = l.schedule.rows;
  const actions = [];
  if (l.status === 'approved') actions.push(`<button class="pri" data-act="agreement" data-id="${l.id}">Generate agreement (${S.lang.toUpperCase()}) &amp; send for e-signature</button>`);
  if (l.status === 'approved' && l.agreement) actions.push(`<button class="pri" data-act="sign" data-id="${l.id}">Simulate signed callback</button>`);
  if (l.status === 'signed') actions.push(`<button class="pri" data-act="order" data-id="${l.id}" data-ev="delivered">Simulate order "delivered" event</button>`);
  if (['approved', 'signed'].includes(l.status)) actions.push(`<button data-act="cancel-loan" data-id="${l.id}">Cancel before activation</button>`);
  if (['active', 'in_arrears'].includes(l.status)) actions.push(`<button class="pri" data-act="pay-modal" data-id="${l.id}">Post payment</button><button data-act="settle-quote" data-id="${l.id}">Settlement quote</button><button data-act="partial-modal" data-id="${l.id}">Partial settlement</button><button data-act="return-modal" data-id="${l.id}">Goods return</button><button data-act="due-modal" data-id="${l.id}">Change due date</button>`);
  const hist = l.scheduleHistory.length ? `<p class="muted">Schedule version ${l.schedule.version} (${esc(l.schedule.reason)}) · ${l.scheduleHistory.length} earlier version(s) retained</p>` : `<p class="muted">Schedule version ${l.schedule.version} (${esc(l.schedule.reason)})</p>`;
  return `<span class="crumb" data-act="nav" data-view="loans">← All loans</span>
  <div class="row"><h1 style="margin:0">${l.id}</h1>${statusTag(l.status)}${l.promo ? tag('Promo ' + l.promo, 'ok') : ''}<span class="sp"></span><span class="muted">${esc(l.customerName)} · NIC ${l.nic} · ${esc(l.product)} · order ${esc(l.order.id)}</span></div>
  <div class="steps">${stepper}</div>
  <div class="grid g4"><div class="card kpi"><small>Loan amount</small><b>LKR ${lkr0(l.principal)}</b><i>Cash price ${lkr0(l.cashPrice)} − down ${lkr0(l.downPayment)}</i></div>
  <div class="card kpi"><small>Instalment</small><b>LKR ${lkr0(l.instalment)}</b><i>${l.tenor} months · ${(l.annualFlatRate * 100).toFixed(1)}% flat p.a.</i></div>
  <div class="card kpi"><small>Outstanding</small><b>LKR ${lkr0(l.outstanding)}</b><i>${l.creditBalance ? 'Credit balance ' + lkr0(l.creditBalance) : 'Incl. penalties'}</i></div>
  <div class="card kpi"><small>Days past due</small><b>${l.dpd}</b><i>${esc(l.bucket)}</i></div></div>
  ${actions.length ? `<div class="card row" style="margin-top:14px">${actions.join('')}</div>` : ''}
  ${l.agreement ? `<div class="card" style="margin-top:14px"><div class="row"><h2 style="margin:0">Agreement ${esc(l.agreement.templateVersion)} (${l.agreement.lang})</h2>${l.agreement.signedAt ? tag('Signed ' + l.agreement.signedAt + ' · ' + l.agreement.docRef, 'ok') : tag('Awaiting e-signature', 'warn')}</div><pre>${esc(l.agreement.text)}</pre></div>` : ''}
  <div class="card" style="margin-top:14px"><h2>Repayment schedule</h2>${hist}
  <table><tr><th>#</th><th>Due</th><th class="r">Principal</th><th class="r">Charges</th><th class="r">Penalty</th><th class="r">Due total</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr>
  ${rows.map(r => { const tot = r.principal + r.charge + r.fee + r.penalty; const paid = r.paid.principal + r.paid.charge + r.paid.fee + r.paid.penalty; const bal = tot - paid; const late = r.due < S.clock && bal > 0.005;
    return `<tr><td>${r.no}</td><td>${r.due}${r.due !== r.nominal ? ` <span class="muted">(was ${r.nominal})</span>` : ''}</td><td class="r">${lkr(r.principal)}</td><td class="r">${lkr(r.charge + r.fee)}</td><td class="r">${r.penalty ? lkr(r.penalty) : ''}</td><td class="r">${lkr(tot)}</td><td class="r">${lkr(paid)}</td><td class="r">${lkr(bal)}</td><td>${bal <= 0.005 ? tag('paid', 'ok') : late ? tag('overdue', 'bad') : ''}${late && r.penalty - r.paid.penalty > 0 ? ` <button class="sm" data-act="waive" data-id="${l.id}" data-no="${r.no}">Waive</button>` : ''}</td></tr>`; }).join('')}</table></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Payments</h2>${l.payments.length ? `<table><tr><th>Date</th><th>Channel</th><th class="r">Amount</th><th></th></tr>${l.payments.slice().reverse().map(x => `<tr><td>${x.date}</td><td>${esc(x.channel)}${x.settlement ? ' (settlement)' : ''}</td><td class="r">${lkr(x.amount)}</td><td>${x.reversed ? tag('reversed', 'bad') : x.channel === 'return_credit' ? '' : `<button class="sm" data-act="reverse" data-id="${l.id}" data-pay="${x.id}">Reverse</button>`}</td></tr>`).join('')}</table>` : '<p class="muted">No payments yet.</p>'}</div>
  <div class="card"><h2>Lifecycle</h2><table>${l.timeline.map(t => `<tr><td>${t.at}</td><td>${statusTag(t.status)}</td><td class="muted">${esc(t.note || '')}</td></tr>`).join('')}</table>${l.ddLog ? `<h2 style="margin-top:14px">Direct-debit attempts</h2><table>${l.ddLog.slice(-6).map(x => `<tr><td>${x.at}</td><td>#${x.row}</td><td class="r">${lkr(x.amount)}</td><td>${tag(x.result, x.result === 'success' ? 'ok' : 'bad')}</td></tr>`).join('')}</table>` : ''}</div></div>`;
};

VIEWS.collections = async () => {
  const q = await api('queue');
  const buckets = {};
  q.forEach(x => { buckets[x.bucket] = (buckets[x.bucket] || 0) + 1; });
  return `<h1>Collections</h1><p class="sub">Case queue for the SINGER call center (customer contact only; no third-party contact).</p>
  <div class="row" style="margin-bottom:12px">${Object.entries(buckets).map(([k, v]) => tag(`${k} days: ${v}`, 'bad')).join('') || tag('No arrears', 'ok')}</div>
  <div class="card"><table><tr><th>Loan</th><th>Customer</th><th>Phone</th><th class="r">DPD</th><th>Bucket</th><th class="r">Overdue</th><th class="r">Outstanding</th><th>Promise to pay</th><th>Last contact</th><th></th></tr>
  ${q.map(x => `<tr><td><a href="#" data-act="open-loan" data-id="${x.loan}">${x.loan}</a></td><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td class="r">${x.dpd}</td><td>${esc(x.bucket)}</td><td class="r">${lkr0(x.overdue)}</td><td class="r">${lkr0(x.outstanding)}</td><td>${x.ptp ? `${x.ptp.promiseDate} · ${lkr0(x.ptp.amount)}` : ''}</td><td>${x.lastContact ? esc(x.lastContact.outcome) : ''}</td>
  <td><div class="row"><button class="sm" data-act="contact" data-id="${x.loan}">Log contact</button><button class="sm" data-act="ptp" data-id="${x.loan}">PTP</button><button class="sm" data-act="restructure" data-id="${x.loan}">Restructure</button><button class="sm" data-act="writeoff" data-id="${x.loan}">Write off</button></div></td></tr>`).join('')}</table></div>`;
};

VIEWS.customers = async () => {
  const cs = await api('customers');
  return `<h1>Customers &amp; credit limits</h1><p class="sub">One record per NIC. Exposure combines IFS hire-purchase balances, CREDIT loans and pending-order reservations.</p>
  <div class="card"><table><tr><th>Customer</th><th>NIC</th><th>Tier</th><th class="r">Score</th><th>Limit</th><th class="r">HP</th><th class="r">CREDIT</th><th class="r">Reserved</th><th class="r">Available</th><th></th></tr>
  ${cs.map(c => `<tr><td><b>${esc(c.name)}</b><div class="muted">${esc(c.lang)} · ${c.ekyc.status} e-KYC${c.ifs.hpDelinquent ? ' · HP delinquent' : ''}</div></td><td>${c.nic}</td><td>${c.tier || '-'}</td><td class="r">${c.score || ''}</td><td>${tag(c.limitStatus, c.limitStatus === 'active' ? 'ok' : 'bad')} <span class="muted">${lkr0(c.creditLimit)}</span></td><td class="r">${lkr0(c.exposure.hp)}</td><td class="r">${lkr0(c.exposure.credit)}</td><td class="r">${lkr0(c.exposure.reserved)}</td><td class="r">${lkr0(c.exposure.available)}</td>
  <td><div class="row">${c.limitStatus === 'frozen' ? `<button class="sm" data-act="limit" data-nic="${c.nic}" data-a="reactivate">Reactivate</button>` : c.limitStatus === 'active' ? `<button class="sm" data-act="limit" data-nic="${c.nic}" data-a="freeze">Freeze</button>` : ''}</div></td></tr>`).join('')}</table></div>`;
};

VIEWS.reports = async () => {
  const r = await api('dashboard');
  const loans = await api('loans');
  return `<h1>Reports</h1><p class="sub">Exportable to CSV.</p><div class="grid g2">
  <div class="card"><div class="row"><h2 style="margin:0">Loan book</h2><span class="sp"></span><button data-act="export" data-n="loan-book">Export CSV</button></div><table style="margin-top:8px"><tr><th>Loan</th><th>Status</th><th class="r">Principal</th><th class="r">Outstanding</th><th class="r">DPD</th></tr>${loans.map(l => `<tr><td>${l.id}</td><td>${esc(l.status)}</td><td class="r">${lkr0(l.principal)}</td><td class="r">${lkr0(l.outstanding)}</td><td class="r">${l.dpd || ''}</td></tr>`).join('')}</table></div>
  <div class="card"><div class="row"><h2 style="margin:0">Customer exposure</h2><span class="sp"></span><button data-act="export" data-n="exposure">Export CSV</button></div><table style="margin-top:8px"><tr><th>Customer</th><th>Tier</th><th class="r">HP</th><th class="r">CREDIT</th><th class="r">Reserved</th><th class="r">Total</th></tr>${r.exposures.map(e => `<tr><td>${esc(e.name)}</td><td>${e.tier}</td><td class="r">${lkr0(e.hp)}</td><td class="r">${lkr0(e.credit)}</td><td class="r">${lkr0(e.reserved)}</td><td class="r">${lkr0(e.total)}</td></tr>`).join('')}</table></div></div>`;
};

VIEWS.policy = async () => {
  const p = S.policy;
  const versions = await api('policyVersions');
  return `<h1>Policy &amp; pricing</h1><p class="sub">Rules, pricing and templates are configuration, effective-dated and versioned; no code release required. System-wide caps are enforced.</p>
  <div class="grid g2"><div class="card"><h2>Risk-tier pricing</h2><table><tr><th>Tier</th><th class="r">Limit</th><th class="r">Flat p.a.</th><th>Tenors</th><th class="r">Min down</th><th class="r">Auto-approve ≤</th></tr>${Object.entries(p.tiers).map(([t, v]) => `<tr><td>${t}</td><td class="r">${lkr0(v.limit)}</td><td class="r">${(v.annualFlat * 100).toFixed(1)}%</td><td>${v.tenors.join(', ') || '-'}</td><td class="r">${(v.minDownPct * 100).toFixed(0)}%</td><td class="r">${lkr0(v.autoApproveMax)}</td></tr>`).join('')}</table>
  <h2 style="margin-top:16px">System-wide caps</h2><p class="muted">Rate ${(p.caps.maxAnnualFlatRate * 100)}% p.a. · fee ${(p.caps.maxProcessingFeePct * 100)}% · penal ${(p.caps.maxPenalRatePerMonth * 100)}%/month · late fee LKR ${p.caps.maxLateFee}</p></div>
  <div class="card"><h2>Change a rule (takes effect on a date)</h2><div class="form" style="grid-template-columns:1fr 1fr">
    <div><label>Grace days</label><input id="p-grace" type="number" value="${p.graceDays}"></div><div><label>Late fee (LKR)</label><input id="p-late" type="number" value="${p.lateFee}"></div>
    <div><label>Penal rate per month (%)</label><input id="p-penal" type="number" step="0.1" value="${p.penalRatePerMonth * 100}"></div><div><label>Settlement discount (%)</label><input id="p-disc" type="number" step="0.1" value="${p.settlement.discountPct * 100}"></div>
    <div><label>Effective from</label><input id="p-eff" type="date" value="${S.clock}"></div><div style="align-self:end"><button class="pri" data-act="save-policy">Save new version</button></div></div>
    <h2 style="margin-top:16px">Versions</h2>${versions.map(v => `<div>${tag(v.effective)} <span class="muted">grace ${v.data.graceDays}d · late fee ${v.data.lateFee} · penal ${(v.data.penalRatePerMonth * 100).toFixed(1)}%</span></div>`).join('')}</div></div>
  <div class="card" style="margin-top:14px"><h2>HP protection rules</h2><table><tr><th>Category</th><th class="r">From price</th><th>Required tier</th><th>Why</th></tr>${p.hpProtection.map(r => `<tr><td>${esc(r.category)}</td><td class="r">${lkr0(r.minPrice)}</td><td>${r.requireTier}</td><td class="muted">${esc(r.note)}</td></tr>`).join('')}</table></div>`;
};

VIEWS.audit = async () => {
  const [audit, outbox, ifs] = await Promise.all([api('audit'), api('outbox'), api('ifsPostings')]);
  return `<h1>Audit &amp; notifications</h1><p class="sub">Immutable audit log with before/after values; notification outbox in three languages; IFS accounting postings.</p>
  <div class="card"><h2>Audit trail (latest 500)</h2><table><tr><th>#</th><th>Date</th><th>Actor</th><th>Action</th><th>Entity</th><th>After</th></tr>${audit.slice(0, 60).map(a => `<tr><td>${a.id}</td><td>${a.at}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.entity)}</td><td class="muted" style="max-width:420px;word-break:break-word">${esc(JSON.stringify(a.after)).slice(0, 160)}</td></tr>`).join('')}</table></div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Notification outbox</h2><table>${outbox.filter(o => o.channel === 'sms').slice(0, 25).map(o => `<tr><td>${o.at}</td><td>${tag(o.lang)}</td><td>${esc(o.text)}</td></tr>`).join('')}</table></div>
  <div class="card"><h2>IFS postings</h2><table>${ifs.slice(0, 25).map(x => `<tr><td>${x.at}</td><td>${esc(x.type)}</td><td>${esc(x.loan)}</td><td class="r">${lkr(x.amount)}</td></tr>`).join('')}</table></div></div>`;
};

// ----------------------------------------------------------------- actions
function field(id, label, type = 'text', val = '') { return `<div><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`; }
const val = id => $('#' + id).value;

const ACTIONS = {
  nav: el => { closeModal(); return go(el.dataset.view); },
  close: () => closeModal(),
  'open-loan': async el => { closeModal(); await go('loan', el.dataset.id); },
  advance: async el => { await api('advance', +el.dataset.days); toast(`Advanced ${el.dataset.days} day(s); direct-debit, accruals and reminders ran`); await go(S.view === 'loan' ? 'loan' : S.view); },
  reset: async () => { await api('reset'); S.draft = null; toast('Demo data reset'); await go('dashboard'); },
  quote: () => doQuote(),
  pick: el => { document.querySelectorAll('.opt').forEach(o => o.classList.remove('sel')); el.classList.add('sel'); S.draft.tenor = +el.dataset.tenor; $('#picked').textContent = `Selected ${el.dataset.tenor}-month plan`; },
  'submit-app': () => doSubmit(),
  decide: async el => {
    const id = el.dataset.id;
    await api('decide', id, { decision: el.dataset.d, user: 'underwriter.demo', role: val('role-' + id), note: val('note-' + id) });
    toast('Decision recorded'); await go('queue');
  },
  agreement: async el => { await api('agreement', el.dataset.id, S.lang); toast('Agreement generated and sent to the e-signature system'); await go('loan'); },
  sign: async el => { await api('sign', el.dataset.id); toast('Signed status received'); await go('loan'); },
  order: async el => { await api('orderEvent', el.dataset.id, el.dataset.ev, {}); toast('Loan activated; proceeds allocated to SINGER'); await go('loan'); },
  'cancel-loan': async el => { await api('cancel', el.dataset.id); toast('Loan cancelled; reservation released'); await go('loan'); },
  'pay-modal': el => modal(`<h2>Post payment · ${el.dataset.id}</h2><div class="form" style="grid-template-columns:1fr 1fr">${field('m-amt', 'Amount (LKR)', 'number', 10000)}<div><label>Channel</label><select id="m-ch"><option>branch</option><option>card</option><option>lankaqr</option><option>bank_transfer</option></select></div></div><div class="row" style="margin-top:14px"><button class="pri" data-act="pay" data-id="${el.dataset.id}">Post</button><button data-act="close">Cancel</button></div>`),
  pay: async el => { const p = await api('pay', el.dataset.id, { amount: +val('m-amt'), channel: val('m-ch') }); closeModal(); toast('Payment allocated: ' + p.allocations.map(a => `#${a.no} ${a.comp} ${lkr(a.amount)}`).join(', ')); await go('loan'); },
  reverse: async el => { await api('reverse', el.dataset.id, el.dataset.pay, 'ops.checker', 'Incorrectly posted'); toast('Payment reversed with approval'); await go('loan'); },
  'settle-quote': async el => {
    const q = await api('settleQuote', el.dataset.id); const b = q.breakdown;
    modal(`<h2>Settlement quote ${q.id}</h2><table><tr><td>Due and overdue (incl. penalties)</td><td class="r">${lkr(b.overdueAndDue)}</td></tr><tr><td>Remaining principal</td><td class="r">${lkr(b.remainingPrincipal)}</td></tr><tr><td>Remaining fees</td><td class="r">${lkr(b.remainingFees)}</td></tr><tr><td>Remaining service charges</td><td class="r">${lkr(b.remainingCharges)}</td></tr><tr><td>Unearned charge rebate (${q.method})</td><td class="r">− ${lkr(b.unearnedChargeRebate)}</td></tr><tr><td>Settlement discount</td><td class="r">− ${lkr(b.settlementDiscount)}</td></tr><tr><td><b>Settle today</b></td><td class="r big">LKR ${lkr(q.amount)}</td></tr></table><p class="muted">Valid until ${q.validUntil}</p>
    <div class="row"><button class="pri" data-act="settle" data-id="${el.dataset.id}" data-q="${q.id}">Collect and settle</button><button data-act="close">Close</button></div>`);
  },
  settle: async el => { await api('settle', el.dataset.id, el.dataset.q); closeModal(); toast('Loan settled and closed'); await go('loan'); },
  'partial-modal': el => modal(`<h2>Partial settlement · ${el.dataset.id}</h2><p class="muted">Clears dues first, then reduces remaining principal; unearned charge on the reduced principal is rebated and the schedule is regenerated.</p>${field('m-amt', 'Amount (LKR)', 'number', 30000)}<div class="row" style="margin-top:14px"><button class="pri" data-act="partial" data-id="${el.dataset.id}">Apply</button><button data-act="close">Cancel</button></div>`),
  partial: async el => { const r = await api('partial', el.dataset.id, +val('m-amt')); closeModal(); toast('Applied; charge rebated ' + lkr(r.chargeReduced)); await go('loan'); },
  'return-modal': el => modal(`<h2>Goods return · ${el.dataset.id}</h2><p class="muted">Approved return: schedule recalculated on the revised value, limit restored, refund calculated if over-paid.</p>${field('m-val', 'Returned goods value (LKR)', 'number', 50000)}${field('m-why', 'Reason', 'text', 'Faulty item')}<div class="row" style="margin-top:14px"><button class="pri" data-act="return" data-id="${el.dataset.id}">Approve return</button><button data-act="close">Cancel</button></div>`),
  return: async el => { const r = await api('returnGoods', el.dataset.id, +val('m-val'), 'ops.checker', val('m-why')); closeModal(); toast(`Revised instalment LKR ${lkr(r.revisedInstalment)}; refund due LKR ${lkr(r.refund)}`); await go('loan'); },
  'due-modal': el => modal(`<h2>Change due date (one time)</h2><label>New day of month</label><select id="m-day">${S.policy.dueDay.allowedDays.map(d => `<option>${d}</option>`).join('')}</select><div class="row" style="margin-top:14px"><button class="pri" data-act="due" data-id="${el.dataset.id}">Approve change</button><button data-act="close">Cancel</button></div>`),
  due: async el => { await api('dueDate', el.dataset.id, +val('m-day'), 'ops.checker'); closeModal(); toast('Due date changed; schedule version retained'); await go('loan'); },
  waive: async el => { const w = await api('waive', el.dataset.id, +el.dataset.no, 100000, 'credit.manager', 'Goodwill'); toast(`Waived LKR ${lkr(w)} through approval`); await go('loan'); },
  contact: el => modal(`<h2>Log contact · ${el.dataset.id}</h2><div><label>Outcome</label><select id="m-out"><option>Promised to pay</option><option>No answer</option><option>Disputed</option><option>Wrong number</option></select></div>${field('m-note', 'Note', 'text', '')}<div class="row" style="margin-top:14px"><button class="pri" data-act="contact-save" data-id="${el.dataset.id}">Save</button><button data-act="close">Cancel</button></div>`),
  'contact-save': async el => { await api('contact', el.dataset.id, { outcome: val('m-out'), note: val('m-note'), user: 'agent.demo' }); closeModal(); toast('Contact logged'); await go('collections'); },
  ptp: el => modal(`<h2>Promise to pay · ${el.dataset.id}</h2>${field('m-date', 'Promise date', 'date', S.clock)}${field('m-amt', 'Amount', 'number', 20000)}<div class="row" style="margin-top:14px"><button class="pri" data-act="ptp-save" data-id="${el.dataset.id}">Save</button><button data-act="close">Cancel</button></div>`),
  'ptp-save': async el => { await api('ptp', el.dataset.id, { date: val('m-date'), amount: +val('m-amt'), user: 'agent.demo' }); closeModal(); toast('Promise recorded'); await go('collections'); },
  restructure: el => modal(`<h2>Restructure · ${el.dataset.id}</h2><p class="muted">Approval required. Extends the remaining schedule.</p>${field('m-mon', 'Extra months', 'number', 3)}<div class="row" style="margin-top:14px"><button class="pri" data-act="restructure-save" data-id="${el.dataset.id}">Approve</button><button data-act="close">Cancel</button></div>`),
  'restructure-save': async el => { await api('restructure', el.dataset.id, +val('m-mon'), 'collections.head', 'Hardship'); closeModal(); toast('Loan restructured'); await go('collections'); },
  writeoff: async el => { if (!confirm('Write off ' + el.dataset.id + '? Requires approval and blocks the customer.')) return; await api('writeOff', el.dataset.id, 'finance.head', 'Uncollectable'); toast('Written off with approval'); await go('collections'); },
  limit: async el => { await api('limitAction', el.dataset.nic, el.dataset.a); toast('Limit ' + el.dataset.a + 'd'); await go('customers'); },
  'save-policy': async () => {
    const p = S.policy;
    const patch = { graceDays: +val('p-grace'), lateFee: +val('p-late'), penalRatePerMonth: +val('p-penal') / 100, settlement: Object.assign({}, p.settlement, { discountPct: +val('p-disc') / 100 }) };
    await api('updatePolicy', patch, val('p-eff')); toast('New policy version saved'); await go('policy');
  },
  export: async el => {
    let rows;
    if (el.dataset.n === 'loan-book') rows = (await api('loans')).map(l => ({ loan: l.id, customer: l.customerName, product: l.product, status: l.status, principal: l.principal, outstanding: l.outstanding, dpd: l.dpd }));
    else rows = (await api('dashboard')).exposures;
    const file = await api('exportCsv', el.dataset.n, rows); toast('Saved ' + file);
  }
};

document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); return go(nav.dataset.nav); }
  const lang = e.target.closest('[data-lang]');
  if (lang) { S.lang = lang.dataset.lang; if (S.lastQuote && S.view === 'apply' && $('#quote-out').innerHTML) { await refreshChrome(); return doQuote(); } return go(S.view); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) { try { await fn(el); } catch (err) { /* already toasted */ } }
});

go('dashboard');
