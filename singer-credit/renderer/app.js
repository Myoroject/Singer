'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lkr = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lkr0 = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const S = { clock: '', policy: null, lang: 'en', view: 'dashboard', loanId: null, loanTab: 'overview', auditTab: 'audit', draft: null };

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
  setTimeout(() => el.remove(), err ? 6000 : 3600);
}
const tag = (t, cls) => `<span class="tag ${cls || ''}">${esc(t)}</span>`;
const STATUS_CLS = { active: 'ok', settled: 'ok', approved: 'info', signed: 'info', referred: 'warn', in_arrears: 'bad', declined: 'bad', written_off: 'bad' };
const statusTag = s => tag(s.replace('_', ' '), STATUS_CLS[s] || '');
const btn = (label, act, attrs = '', cls = '') => `<button class="btn ${cls}" data-act="${act}" ${attrs}>${label}</button>`;

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>',
  apply: '<path d="M12 5v14M5 12h14"/>',
  queue: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M17 5.5a3 3 0 0 1 0 5.5M21 20c-.3-2.2-1.4-3.8-3-4.6"/>',
  loans: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  disb: '<path d="M3 11l9-6 9 6M5 11v8h14v-8M9 19v-5h6v5"/>',
  collections: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  customers: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4 3.8-6 8-6s7.4 2 8 6"/>',
  reports: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  policy: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  audit: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  guide: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 8h6"/>'
};
const icon = k => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`;
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'], ['apply', 'New application', 'apply'], ['queue', 'Underwriter queue', 'queue'], ['loans', 'Loans', 'loans'],
  ['disbursements', 'Disbursements', 'disb'], ['collections', 'Collections', 'collections'], ['customers', 'Customers', 'customers'],
  ['reports', 'Reports', 'reports'], ['policy', 'Policy', 'policy'], ['audit', 'Audit log', 'audit'], ['guide', 'User guide', 'guide']
];
const fmtDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function refreshChrome() {
  const st = await api('state');
  S.clock = st.clock; S.policy = st.policy; S.promos = st.promos; S.labels = st.labels;
  $('#clock').textContent = fmtDate(S.clock);
  const dash = await api('dashboard');
  $('#nav').innerHTML = NAV.map(([k, t, ic]) => {
    const n = k === 'queue' ? dash.counts.referred : k === 'collections' ? dash.counts.arrears : 0;
    return `<button data-nav="${k}" class="${S.view === k || (k === 'loans' && S.view === 'loan') ? 'on' : ''}">${icon(ic)}<span>${t}</span>${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('');
  $('#langSwitch').innerHTML = [['en', 'EN'], ['si', 'සිං'], ['ta', 'தமிழ்']].map(([k, t]) => `<button data-lang="${k}" class="${S.lang === k ? 'on' : ''}">${t}</button>`).join('');
}

async function go(view, extra) {
  S.view = view;
  if (extra !== undefined) S.loanId = extra;
  await refreshChrome();
  $('#view').innerHTML = `<div class="wrap">${await VIEWS[view]()}</div>`;
  $('#view').scrollTop = 0;
  if (AFTER[view]) AFTER[view]();
}
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
const head = (title, sub, right = '') => `<div class="head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><span class="sp"></span>${right}</div>`;

const VIEWS = {};
const AFTER = {};

// ----------------------------------------------------------------- dashboard
VIEWS.dashboard = async () => {
  const r = await api('dashboard');
  const maxAge = Math.max(1, ...Object.values(r.ageing));
  const tot = r.hpVsCredit.hp + r.hpVsCredit.credit || 1;
  const kpi = (cls, ic, label, val, unit, help) => `<div class="card kpi ${cls}"><span class="ic">${icon(ic)}</span><div class="lbl">${label}</div><div class="val">${unit ? `<small>${unit}</small>` : ''}${val}</div><div class="help">${help}</div></div>`;
  return `${head('Dashboard', 'Portfolio position today')}
  <div class="grid g4">
    ${kpi('blue', 'loans', 'Active loans', r.counts.active + r.counts.arrears, '', r.counts.arrears ? `${r.counts.arrears} in arrears` : 'All on schedule')}
    ${kpi('green', 'reports', 'CREDIT outstanding', lkr0(r.outstanding), 'LKR', 'Across all active loans')}
    ${kpi('red', 'disb', 'Disbursed to SINGER', lkr0(r.disbursed), 'LKR', 'Paid against orders, never to customers')}
    ${kpi('amber', 'queue', 'Awaiting underwriter', r.counts.referred, '', r.counts.referred ? 'SLA timers running' : 'Queue is clear')}
  </div>
  <div class="grid g2" style="margin-top:20px">
    <div class="card"><div class="sect">Arrears ageing</div>${Object.entries(r.ageing).map(([k, v]) => `<div class="row" style="margin:14px 0"><span style="width:64px" class="muted">${esc(k)}</span><div class="bar2 sp"><i style="width:${v / maxAge * 100}%;background:${k === 'Current' ? 'var(--ok)' : 'var(--accent)'}"></i></div><span style="width:96px;text-align:right"><b>${lkr0(v)}</b></span></div>`).join('')}</div>
    <div class="card"><div class="sect">Total exposure</div><div class="bar2" style="height:14px"><i style="width:${r.hpVsCredit.hp / tot * 100}%;background:var(--info)"></i><i style="width:${r.hpVsCredit.credit / tot * 100}%;background:var(--ok)"></i></div>
      <div class="row" style="margin-top:12px"><span>${tag('SINGER HP', 'info')} <b>LKR ${lkr0(r.hpVsCredit.hp)}</b></span><span class="sp"></span><span>${tag('CREDIT', 'ok')} <b>LKR ${lkr0(r.hpVsCredit.credit)}</b></span></div>
      <div class="divider"></div><div class="sect">Decisions by risk tier</div>
      <table><tr><th>Tier</th><th class="r">Approved</th><th class="r">Referred</th><th class="r">Declined</th></tr>${Object.entries(r.byTier).sort().map(([t, v]) => `<tr><td>Tier ${t}</td><td class="r">${v.approved}</td><td class="r">${v.referred}</td><td class="r">${v.declined}</td></tr>`).join('')}</table></div>
  </div>`;
};

// ----------------------------------------------------------------- new application (3-step wizard)
const W = { step: 1, quote: null, kyc: null, result: null };
const KYC_TITLES = { 'e-KYC verified': 'e-KYC verification', 'Bank account verified': 'Bank account and direct-debit mandate', 'No delinquent SINGER HP / BNPL accounts': 'SINGER account standing', 'Credit limit active': 'Credit limit', 'HP protection rules': 'HP protection check' };

function progress(step) {
  const labels = ['Customer & purchase', 'Verification & plan', 'Decision'];
  return `<div class="progress"><div class="track"><i style="width:${(step - 1) / 2 * 100}%"></i></div><div class="nodes">${labels.map((t, i) => { const n = i + 1; return `<div class="node ${n < step || (n === 3 && step === 3 && W.result) ? 'done' : n === step ? 'cur' : ''}"><span class="dot">${n < step || (n === 3 && W.result) ? '✓' : n}</span><span class="lbl">${t}</span></div>`; }).join('')}</div></div>`;
}

VIEWS.apply = async () => {
  const body = W.step === 1 ? await wizStep1() : W.step === 2 ? wizStep2() : wizStep3();
  return `${head('New application', 'The same journey the SINGER website follows at checkout.')}${progress(W.step)}${body}`;
};
AFTER.apply = () => { const el = $('#f-nic'); if (el) el.onchange = async () => { S.draft = Object.assign(S.draft || {}, { nic: el.value }); await go('apply'); }; };

async function wizStep1() {
  const customers = await api('customers');
  const d = S.draft || {};
  const nic = d.nic || customers[0].nic;
  const docs = (await api('customerDocs', nic)) || {};
  const prods = Object.keys(S.policy.products);
  const reg = docs.salaryMonthsRegular !== undefined ? docs.salaryMonthsRegular : 6;
  return `<div class="card stepcard"><h2>Customer &amp; purchase</h2><p class="lead">Choose the customer and describe what they are buying.</p><div class="form">
    <div class="full"><label>Customer</label><select id="f-nic">${customers.map(c => `<option value="${c.nic}" ${c.nic === nic ? 'selected' : ''}>${esc(c.name)} · ${c.nic} · tier ${c.tier || '-'} · ${c.limitStatus}</option>`).join('')}</select></div>
    <div><label>Product category</label><select id="f-prod">${prods.map(p => `<option ${p === (d.product || 'Electronics') ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div><label>Cash price (LKR)</label><input id="f-price" type="number" value="${d.cashPrice || 150000}"></div>
    <div><label>Down payment (LKR)</label><input id="f-down" type="number" value="${d.downPayment !== undefined ? d.downPayment : 15000}"></div>
    <div><label>Promo code <span class="muted">(optional)</span></label><input id="f-promo" value="${esc(d.promoCode || '')}" placeholder="ZERO6 or FEST5"></div>
    <div class="full"><details><summary><b>Income documents</b><span class="muted small">Income ${lkr0(docs.monthlyIncome || 100000)} · obligations ${lkr0(docs.monthlyObligations || 20000)} · salary regular ${reg}/6 · tamper risk ${docs.tamperRisk !== undefined ? docs.tamperRisk : 5}</span></summary>
      <div class="inner"><p class="muted small" style="margin-top:0">Values extracted by OCR and statement parsing. Editable for the demo.</p><div class="form">
        <div><label>Monthly income</label><input id="f-inc" type="number" value="${docs.monthlyIncome || 100000}"></div>
        <div><label>Monthly obligations</label><input id="f-obl" type="number" value="${docs.monthlyObligations || 20000}"></div>
        <div><label>Salary regular months (of 6)</label><input id="f-reg" type="number" min="0" max="6" value="${reg}"></div>
        <div><label>Tamper risk score (0-100)</label><input id="f-tam" type="number" min="0" max="100" value="${docs.tamperRisk !== undefined ? docs.tamperRisk : 5}"></div></div></div></details></div>
    <div class="full"><details><summary><b>Guarantor</b><span class="muted small">Only when required by policy</span></summary>
      <div class="inner"><div class="form"><div><label>Guarantor NIC</label><input id="f-gnic" value="${esc(d.gnic || '')}" placeholder="e.g. 856234567V"></div><div><label>Relationship</label><input id="f-grel" value="${esc(d.grel || 'Spouse')}"></div></div></div></details></div>
  </div><div class="wiz-actions"><span class="sp"></span>${btn('Continue', 'wiz-next', '', 'pri')}</div></div>`;
}

function readDraft() {
  return {
    nic: $('#f-nic').value, product: $('#f-prod').value, cashPrice: +$('#f-price').value, downPayment: +$('#f-down').value, promoCode: $('#f-promo').value.trim(),
    orderId: (S.draft && S.draft.orderId) || 'ORD-' + Math.floor(90000 + Math.random() * 9000),
    docs: { monthlyIncome: +$('#f-inc').value, monthlyObligations: +$('#f-obl').value, salaryMonthsRegular: +$('#f-reg').value, tamperRisk: +$('#f-tam').value },
    gnic: $('#f-gnic').value.trim(), grel: $('#f-grel').value
  };
}

function wizStep2() {
  const q = W.quote, k = W.kyc, L = S.labels[S.lang], d = S.draft;
  const age = k.checks.find(c => c.rule === 'Minimum age 18');
  const rows = [{ title: 'Identity (NIC)', pass: age.pass, detail: `${k.customer.nic} · born ${k.customer.dob} · ${age.detail.toLowerCase()}` }]
    .concat(k.checks.filter(c => c !== age).map(c => ({ title: KYC_TITLES[c.rule] || c.rule, pass: c.pass, detail: c.detail })));
  const cards = q.options.map(o => {
    const ok = o.withinProductLimits && o.withinCreditLimit && q.downPaymentOk;
    const lines = o.labels[S.lang].filter(([key]) => key !== L.instalment);
    return `<div class="plan ${ok ? '' : 'off'} ${d.tenor === o.tenor ? 'sel' : ''}" data-act="pick" data-tenor="${o.tenor}">
      <div class="row"><span class="t">${o.tenor} ${esc(L.months)}</span>${o.promo ? tag(o.promo, 'ok') : ''}</div>
      <div class="hero">LKR ${lkr0(o.instalment)} <small>/ ${esc(L.instalment).toLowerCase()}</small></div>
      <dl>${lines.map(([key, v]) => `<dt>${esc(key)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${ok ? '' : `<div style="margin-top:10px">${o.withinProductLimits ? '' : tag('Outside product limits', 'bad')} ${o.withinCreditLimit ? '' : tag('Exceeds available credit', 'bad')}</div>`}</div>`;
  }).join('');
  return `<div class="stack"><div class="card stepcard"><h2>Customer verification</h2><p class="lead">${esc(k.customer.name)} · checked against NIC, e-KYC, bank and SINGER records.</p>
    <div class="kyc">${rows.map(r => `<div class="it ${r.pass ? '' : 'bad'}"><span class="mk">${r.pass ? '✔' : '✘'}</span><div class="tx"><b>${esc(r.title)}</b><span>${esc(r.detail)}</span></div><span class="st">${r.pass ? tag('Verified', 'ok') : tag('Action needed', 'bad')}</span></div>`).join('')}</div></div>
    <div class="card stepcard"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">Choose a loan plan</h2>${tag('Risk tier ' + q.tier, 'info')}<span class="sp"></span><span class="muted small">Minimum down payment: LKR ${lkr0(q.minDownPayment)}</span></div>
    <p class="lead">Select the repayment plan the customer prefers. Switch the language at the top to show it in Sinhala or Tamil.</p>
    ${q.notes.map(n => `<div style="margin-bottom:12px">${tag(n, 'bad')}</div>`).join('')}
    <div class="grid g3">${cards || '<div class="muted">No tenors are available for this risk tier.</div>'}</div>
    <div class="wiz-actions">${btn('Back', 'wiz-back')}<span class="muted" id="picked">${d.tenor ? d.tenor + '-month plan selected' : 'Select a plan to continue'}</span><span class="sp"></span><button class="btn pri" data-act="submit-app" id="submitBtn" ${d.tenor ? '' : 'disabled'}>Submit application</button></div></div></div>`;
}

function wizStep3() {
  const r = W.result, a = r.app, o = a.option;
  const checks = a.explain.rules.map(c => `<li><span class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✔' : '✘'}</span> <b>${esc(c.rule)}</b> <span class="muted">${esc(c.detail)}</span></li>`).join('');
  const factors = a.explain.scorecard.map(f => `<tr><td>${esc(f.factor)}</td><td class="muted">${esc(f.detail)}</td><td class="r">${f.points} / ${f.max}</td></tr>`).join('');
  const kind = a.status === 'approved' ? ['ok', '✔', 'Approved instantly'] : a.status === 'referred' ? ['warn', '⏳', 'Sent for manual review'] : ['bad', '✘', 'Application declined'];
  const reasons = (a.declineReasons || a.referReasons || []).map(x => `<li>${esc(x)}</li>`).join('');
  return `<div class="card stepcard" style="max-width:760px;margin:0 auto"><div class="result"><div class="ic ${kind[0]}">${kind[1]}</div><h2>${kind[2]}</h2><p class="muted" style="margin:4px 0 0">${esc(a.id)} · risk tier ${a.explain.tier} · score ${a.explain.score}</p></div>
    ${o ? `<div class="chips"><div><small>Loan amount</small><b>LKR ${lkr0(o.principal)}</b></div><div><small>Instalment</small><b>LKR ${lkr0(o.instalment)}</b></div><div><small>Tenor</small><b>${o.tenor} months</b></div></div>` : ''}
    ${reasons ? `<ul style="margin:12px 0 0;padding-left:20px">${reasons}</ul>` : ''}
    <details id="why" style="margin-top:22px"><summary><b>Why this decision?</b><span class="muted small">Rules checked and scorecard</span></summary><div class="inner"><ul class="checks">${checks}</ul>
      <table style="margin-top:12px"><tr><th>Scorecard factor</th><th>Evidence</th><th class="r">Points</th></tr>${factors}<tr><td><b>Total</b></td><td>Tier ${a.explain.tier}</td><td class="r"><b>${a.explain.score}</b></td></tr></table></div></details>
    <div class="wiz-actions">${btn('Start another application', 'wiz-new')}<span class="sp"></span>${r.loan ? btn('Open loan ' + r.loan.id, 'open-loan', `data-id="${r.loan.id}"`, 'pri') : a.status === 'referred' ? btn('Go to underwriter queue', 'nav', 'data-view="queue"', 'pri') : ''}</div></div>`;
}

async function wizNext() {
  const d = readDraft();
  S.draft = Object.assign(d, { tenor: undefined });
  W.kyc = await api('precheck', d.nic, d.product, d.cashPrice);
  W.quote = await api('quote', { nic: d.nic, product: d.product, cashPrice: d.cashPrice, downPayment: d.downPayment, promoCode: d.promoCode, docs: d.docs });
  W.step = 2; await go('apply');
}

async function doSubmit() {
  const d = S.draft;
  if (!d.tenor) return toast('Select a plan first', true);
  const input = { nic: d.nic, product: d.product, cashPrice: d.cashPrice, downPayment: d.downPayment, promoCode: d.promoCode || null, tenor: d.tenor, orderId: d.orderId, docs: d.docs, lang: S.lang };
  if (d.gnic) input.guarantor = { nic: d.gnic, relationship: d.grel, consent: true };
  W.result = await api('apply', input);
  W.step = 3; await go('apply');
}

// ----------------------------------------------------------------- underwriter queue
VIEWS.queue = async () => {
  const apps = (await api('applications')).filter(a => a.status === 'referred');
  const p = S.policy.approvalAuthority;
  return `${head('Underwriter queue', 'Applications referred for manual review, with approval authority limits and SLA timers.')}
  ${apps.length ? apps.map(a => `<div class="card" style="margin-bottom:20px"><div class="row"><h2 style="margin:0">${esc(a.id)}</h2>${tag(a.product)}${tag('SLA ' + a.sla.hours + 'h', 'warn')}<span class="sp"></span><span class="muted">NIC ${esc(a.nic)} · submitted ${a.createdAt}</span></div>
    <div class="row" style="margin:18px 0"><div class="stat" style="min-width:170px"><small>Loan amount</small><b>LKR ${lkr0(a.option.principal)}</b></div><div class="stat" style="min-width:140px"><small>Tenor</small><b>${a.option.tenor} mo</b></div><div class="stat" style="min-width:140px"><small>Risk</small><b>Tier ${a.explain.tier}</b><i>score ${a.explain.score}</i></div></div>
    <div class="row" style="margin-bottom:18px">${a.referReasons.map(r => tag(r, 'warn')).join('')}</div>
    <div class="divider"></div><div class="row"><select id="role-${a.id}" style="width:270px"><option value="underwriter">Underwriter (up to ${lkr0(p.underwriter)})</option><option value="senior_underwriter">Senior underwriter (up to ${lkr0(p.senior_underwriter)})</option></select>
    <input id="note-${a.id}" placeholder="Decision note" style="width:260px"><span class="sp"></span>${btn('Decline', 'decide', `data-id="${a.id}" data-d="decline"`)}${btn('Approve', 'decide', `data-id="${a.id}" data-d="approve"`, 'pri')}</div></div>`).join('')
    : '<div class="card muted">Nothing is waiting. Referrals appear here, for example Tier C customers or suspected document tampering.</div>'}`;
};

// ----------------------------------------------------------------- loans
VIEWS.loans = async () => {
  const loans = await api('loans');
  return `${head('Loans', loans.length + ' loans')}<div class="card"><table><tr><th>Loan</th><th>Customer</th><th>Status</th><th class="r">Outstanding</th><th>Next due</th></tr>
  ${loans.map(l => `<tr class="click" data-act="open-loan" data-id="${l.id}"><td><b>${l.id}</b><div class="sub">${esc(l.product)}</div></td><td>${esc(l.customerName)}</td><td>${statusTag(l.status)}${l.dpd ? ` <span class="muted small">${l.dpd} days late</span>` : ''}</td><td class="r">LKR ${lkr0(l.outstanding)}</td><td>${l.nextDue ? l.nextDue.due + ' · LKR ' + lkr0(l.nextDue.amount) : '<span class="muted">-</span>'}</td></tr>`).join('')}</table></div>`;
};

function nextStep(l) {
  const id = `data-id="${l.id}"`;
  if (l.status === 'approved' && !l.agreement) return ['Next step', 'Generate the agreement and send it for e-signature.', btn('Send agreement for e-signature', 'agreement', id, 'pri')];
  if (l.status === 'approved') return ['Next step', 'Waiting for the customer to sign the agreement.', btn('Simulate signed callback', 'sign', id, 'pri')];
  if (l.status === 'signed') return ['Next step', 'Agreement signed. The loan activates when the order is delivered.', btn('Simulate order delivered', 'order', id + ' data-ev="delivered"', 'pri')];
  if (l.status === 'active') return ['Performing', l.nextDue ? `Next instalment LKR ${lkr0(l.nextDue.amount)} is due on ${l.nextDue.due}.` : 'All instalments are on schedule.', btn('Post payment', 'pay-modal', id, 'pri')];
  if (l.status === 'in_arrears') return ['Needs attention', `${l.dpd} days past due. Penalties are accruing.`, btn('Post payment', 'pay-modal', id, 'pri')];
  return ['Closed', `This loan is ${l.status.replace('_', ' ')}.`, ''];
}

VIEWS.loan = async () => {
  const l = await api('loan', S.loanId);
  const tabs = [['overview', 'Overview'], ['schedule', 'Schedule'], ['payments', 'Payments'], ['agreement', 'Agreement']];
  const live = ['active', 'in_arrears'].includes(l.status);
  const more = (['approved', 'signed'].includes(l.status) || live) ? btn('More actions', 'more', `data-id="${l.id}"`) : '';
  let body = '';
  if (S.loanTab === 'overview') {
    const [k, text, action] = nextStep(l);
    body = `<div class="grid g2"><div class="next"><div class="k">${k}</div><p>${text}</p>${action}</div>
      <div class="card"><div class="grid g3"><div class="stat"><small>Outstanding</small><b style="font-size:22px">${lkr0(l.outstanding)}</b></div><div class="stat"><small>Instalment</small><b style="font-size:22px">${lkr0(l.instalment)}</b></div><div class="stat"><small>Days late</small><b style="font-size:22px">${l.dpd}</b></div></div></div></div>
    <div class="grid g2" style="margin-top:20px"><div class="card"><h2>Lifecycle</h2><ul class="tl">${l.timeline.slice().reverse().map(t => `<li><div class="row">${statusTag(t.status)}<span class="muted small">${t.at}</span></div>${t.note ? `<div class="muted small">${esc(t.note)}</div>` : ''}</li>`).join('')}</ul></div>
      <div class="card"><h2>Loan terms</h2><dl class="kv"><dt>Product</dt><dd>${esc(l.product)}</dd><dt>Order</dt><dd>${esc(l.order.id)}</dd><dt>Cash price</dt><dd>LKR ${lkr0(l.cashPrice)}</dd><dt>Down payment</dt><dd>LKR ${lkr0(l.downPayment)}</dd><dt>Loan amount</dt><dd>LKR ${lkr0(l.principal)}</dd><dt>Tenor</dt><dd>${l.tenor} months</dd><dt>Service charge</dt><dd>${(l.annualFlatRate * 100).toFixed(1)}% flat p.a.</dd><dt>Processing fee</dt><dd>LKR ${lkr0(l.fee)}</dd>${l.promo ? `<dt>Promotion</dt><dd>${tag(l.promo, 'ok')}</dd>` : ''}${l.creditBalance ? `<dt>Credit balance</dt><dd>LKR ${lkr0(l.creditBalance)}</dd>` : ''}</dl></div></div>`;
  } else if (S.loanTab === 'schedule') {
    const rows = l.schedule.rows;
    body = `<div class="card"><p class="muted small" style="margin-top:0">Version ${l.schedule.version} (${esc(l.schedule.reason)}) · ${l.scheduleHistory.length} earlier version(s) retained</p>
    <table><tr><th>#</th><th>Due</th><th class="r">Principal</th><th class="r">Charges</th><th class="r">Penalty</th><th class="r">Balance</th><th></th></tr>
    ${rows.map(r => { const tot = r.principal + r.charge + r.fee + r.penalty; const paid = r.paid.principal + r.paid.charge + r.paid.fee + r.paid.penalty; const bal = tot - paid; const late = r.due < S.clock && bal > 0.005;
      return `<tr><td>${r.no}</td><td>${r.due}${r.due !== r.nominal ? `<div class="sub">moved from ${r.nominal}</div>` : ''}</td><td class="r">${lkr(r.principal)}</td><td class="r">${lkr(r.charge + r.fee)}</td><td class="r">${r.penalty ? lkr(r.penalty) : ''}</td><td class="r">${lkr(bal)}</td><td class="r">${bal <= 0.005 ? tag('paid', 'ok') : late ? tag('overdue', 'bad') : ''}${late && r.penalty - r.paid.penalty > 0 ? ` <button class="btn link sm" data-act="waive" data-id="${l.id}" data-no="${r.no}">Waive penalty</button>` : ''}</td></tr>`; }).join('')}</table></div>`;
  } else if (S.loanTab === 'payments') {
    body = `<div class="card">${l.payments.length ? `<table><tr><th>Date</th><th>Channel</th><th class="r">Amount</th><th></th></tr>${l.payments.slice().reverse().map(x => `<tr><td>${x.date}</td><td>${esc(x.channel.replace('_', ' '))}${x.settlement ? ' (settlement)' : ''}</td><td class="r">LKR ${lkr(x.amount)}</td><td class="r">${x.reversed ? tag('reversed', 'bad') : x.channel === 'return_credit' ? '' : `<button class="btn link sm" data-act="reverse" data-id="${l.id}" data-pay="${x.id}">Reverse</button>`}</td></tr>`).join('')}</table>` : '<p class="muted">No payments yet.</p>'}
    ${l.ddLog ? `<div class="divider"></div><h2>Direct-debit attempts</h2><table>${l.ddLog.slice(-6).map(x => `<tr><td>${x.at}</td><td>Instalment ${x.row}</td><td class="r">LKR ${lkr(x.amount)}</td><td class="r">${tag(x.result, x.result === 'success' ? 'ok' : 'bad')}</td></tr>`).join('')}</table>` : ''}</div>`;
  } else {
    body = l.agreement ? agreementDoc(l) : '<div class="card muted">No agreement has been generated yet. Use "Send agreement for e-signature" on the Overview tab.</div>';
  }
  return `<span class="crumb" data-act="nav" data-view="loans">← All loans</span>
  ${head(`${l.id} ${statusTag(l.status)}`, `${esc(l.customerName)} · LKR ${lkr0(l.principal)} over ${l.tenor} months`, more)}
  <div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${S.loanTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>${body}`;
};

// ----------------------------------------------------------------- collections
VIEWS.collections = async () => {
  const q = await api('queue');
  const buckets = {};
  q.forEach(x => { buckets[x.bucket] = (buckets[x.bucket] || 0) + 1; });
  return `${head('Collections', 'Case queue for the SINGER call center. Customer contact only; no third-party contact.', `<div class="row">${Object.entries(buckets).map(([k, v]) => tag(`${k} days · ${v}`, 'bad')).join('')}</div>`)}
  <div class="card"><table><tr><th>Customer</th><th>Overdue</th><th>Follow-up</th><th></th></tr>
  ${q.map(x => `<tr><td><b>${esc(x.name)}</b><div class="sub">${esc(x.phone)} · <a href="#" data-act="open-loan" data-id="${x.loan}">${x.loan}</a></div></td>
  <td><b>LKR ${lkr0(x.overdue)}</b><div class="sub">${x.dpd} days · bucket ${esc(x.bucket)}</div></td>
  <td>${x.ptp ? `Promise: LKR ${lkr0(x.ptp.amount)} by ${x.ptp.promiseDate}` : '<span class="muted">No promise yet</span>'}<div class="sub">${x.lastContact ? 'Last contact: ' + esc(x.lastContact.outcome) : 'Not contacted'}</div></td>
  <td class="r"><div class="row" style="justify-content:flex-end">${btn('Log contact', 'contact', `data-id="${x.loan}"`, 'sm')}${btn('Promise to pay', 'ptp', `data-id="${x.loan}"`, 'sm')}${btn('More', 'coll-more', `data-id="${x.loan}"`, 'sm ghost')}</div></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No loans in arrears.</td></tr>'}</table></div>`;
};

// ----------------------------------------------------------------- customers
VIEWS.customers = async () => {
  const cs = await api('customers');
  return `${head('Customers', 'One record per NIC. Exposure combines SINGER HP, CREDIT loans and pending-order reservations.')}
  <div class="card"><table><tr><th>Customer</th><th>Tier</th><th style="width:34%">Exposure vs limit</th><th>Limit</th><th></th></tr>
  ${cs.map(c => { const e = c.exposure; const lim = c.creditLimit || 1; const w = v => Math.min(100, v / lim * 100);
    return `<tr><td><b>${esc(c.name)}</b><div class="sub">${c.nic}${c.ifs.hpDelinquent ? ' · HP delinquent' : ''}</div></td><td>${c.tier ? 'Tier ' + c.tier : '-'}</td>
    <td><div class="bar2"><i style="width:${w(e.hp)}%;background:var(--info)"></i><i style="width:${w(e.credit)}%;background:var(--ok)"></i><i style="width:${w(e.reserved)}%;background:var(--warn)"></i></div>
    <div class="sub">LKR ${lkr0(e.total)} of ${lkr0(c.creditLimit)} · available ${lkr0(e.available)}</div></td>
    <td>${tag(c.limitStatus, c.limitStatus === 'active' ? 'ok' : 'bad')}</td>
    <td class="r">${c.limitStatus === 'frozen' ? btn('Reactivate', 'limit', `data-nic="${c.nic}" data-a="reactivate"`, 'sm') : c.limitStatus === 'active' ? btn('Freeze', 'limit', `data-nic="${c.nic}" data-a="freeze"`, 'sm ghost') : ''}</td></tr>`; }).join('')}</table>
  <div class="row small muted" style="margin-top:14px"><span>${tag('HP', 'info')}</span><span>${tag('CREDIT', 'ok')}</span><span>${tag('Reserved for pending orders', 'warn')}</span></div></div>`;
};

// ----------------------------------------------------------------- reports
VIEWS.reports = async () => {
  const r = await api('dashboard');
  const loans = await api('loans');
  return `${head('Reports', 'Filterable and exportable to CSV.')}<div class="stack">
  <div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Loan book</h2><span class="sp"></span>${btn('Export CSV', 'export', 'data-n="loan-book"', 'sm')}</div><table><tr><th>Loan</th><th>Status</th><th class="r">Principal</th><th class="r">Outstanding</th><th class="r">Days late</th></tr>${loans.map(l => `<tr><td>${l.id}</td><td>${statusTag(l.status)}</td><td class="r">${lkr0(l.principal)}</td><td class="r">${lkr0(l.outstanding)}</td><td class="r">${l.dpd || ''}</td></tr>`).join('')}</table></div>
  <div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Customer exposure</h2><span class="sp"></span>${btn('Export CSV', 'export', 'data-n="exposure"', 'sm')}</div><table><tr><th>Customer</th><th>Tier</th><th class="r">HP</th><th class="r">CREDIT</th><th class="r">Reserved</th><th class="r">Total</th></tr>${r.exposures.map(e => `<tr><td>${esc(e.name)}</td><td>${e.tier}</td><td class="r">${lkr0(e.hp)}</td><td class="r">${lkr0(e.credit)}</td><td class="r">${lkr0(e.reserved)}</td><td class="r">${lkr0(e.total)}</td></tr>`).join('')}</table></div></div>`;
};

// ----------------------------------------------------------------- policy
VIEWS.policy = async () => {
  const p = S.policy;
  const versions = await api('policyVersions');
  const f = (id, label, type, v, step) => `<div><label>${label}</label><input id="${id}" type="${type}" ${step ? `step="${step}"` : ''} value="${v}"></div>`;
  return `${head('Policy', 'Rules and pricing are configuration: effective-dated, versioned and capped. No code release needed.')}
  <div class="stack"><div class="card"><h2>Risk-tier pricing</h2><table><tr><th>Tier</th><th class="r">Credit limit</th><th class="r">Flat rate p.a.</th><th>Tenors (months)</th><th class="r">Min down payment</th><th class="r">Auto-approve up to</th></tr>${Object.entries(p.tiers).map(([t, v]) => `<tr><td>Tier ${t}</td><td class="r">${lkr0(v.limit)}</td><td class="r">${(v.annualFlat * 100).toFixed(1)}%</td><td>${v.tenors.join(', ') || '-'}</td><td class="r">${(v.minDownPct * 100).toFixed(0)}%</td><td class="r">${lkr0(v.autoApproveMax)}</td></tr>`).join('')}</table>
  <p class="muted small" style="margin-bottom:0">System caps: rate ${(p.caps.maxAnnualFlatRate * 100)}% p.a. · fee ${(p.caps.maxProcessingFeePct * 100)}% · penal ${(p.caps.maxPenalRatePerMonth * 100)}% per month · late fee LKR ${p.caps.maxLateFee}</p></div>
  <div class="card"><h2>Change penalty and settlement rules</h2><div class="form" style="grid-template-columns:repeat(3,1fr)">
    ${f('p-grace', 'Grace days', 'number', p.graceDays)}${f('p-late', 'Late fee (LKR)', 'number', p.lateFee)}${f('p-penal', 'Penal rate per month (%)', 'number', p.penalRatePerMonth * 100, '0.1')}
    ${f('p-disc', 'Settlement discount (%)', 'number', p.settlement.discountPct * 100, '0.1')}${f('p-eff', 'Effective from', 'date', S.clock)}<div style="align-self:end">${btn('Save new version', 'save-policy', '', 'pri')}</div></div>
    <div class="divider"></div><h2>Versions</h2>${versions.map(v => `<div class="row" style="margin:6px 0">${tag(v.effective)}<span class="muted small">grace ${v.data.graceDays} days · late fee ${v.data.lateFee} · penal ${(v.data.penalRatePerMonth * 100).toFixed(1)}%</span></div>`).join('')}</div>
  <div class="card"><h2>HP protection rules</h2><table><tr><th>Category</th><th class="r">From price</th><th>Required tier</th><th>Reason</th></tr>${p.hpProtection.map(r => `<tr><td>${esc(r.category === '*' ? 'All categories' : r.category)}</td><td class="r">${lkr0(r.minPrice)}</td><td>Tier ${r.requireTier}</td><td class="muted">${esc(r.note)}</td></tr>`).join('')}</table></div></div>`;
};

// ----------------------------------------------------------------- audit
VIEWS.audit = async () => {
  const [audit, outbox, ifs] = await Promise.all([api('audit'), api('outbox'), api('ifsPostings')]);
  const tabs = [['audit', 'Audit trail'], ['notif', 'Notifications'], ['ifs', 'IFS postings']];
  let body;
  if (S.auditTab === 'audit') body = `<table><tr><th>Date</th><th>Actor</th><th>Action</th><th>Entity</th></tr>${audit.slice(0, 40).map(a => `<tr><td>${a.at}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.entity)}</td></tr>`).join('')}</table>`;
  else if (S.auditTab === 'notif') body = `<table><tr><th>Date</th><th>Language</th><th>Message</th></tr>${outbox.filter(o => o.channel === 'sms').slice(0, 25).map(o => `<tr><td>${o.at}</td><td>${tag(o.lang.toUpperCase())}</td><td>${esc(o.text)}</td></tr>`).join('')}</table>`;
  else body = `<table><tr><th>Date</th><th>Type</th><th>Loan</th><th class="r">Amount</th></tr>${ifs.slice(0, 25).map(x => `<tr><td>${x.at}</td><td>${esc(x.type.replace(/_/g, ' ').toLowerCase())}</td><td>${esc(x.loan)}</td><td class="r">LKR ${lkr(x.amount)}</td></tr>`).join('')}</table>`;
  return `${head('Audit log', 'Immutable record of decisions, payments and configuration changes.')}
  <div class="tabs" style="margin-top:0">${tabs.map(([k, t]) => `<button data-atab="${k}" class="${S.auditTab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div class="card">${body}</div>`;
};


// ----------------------------------------------------------------- agreement document (letter format)
const DOC = {
  en: { ref: 'Ref', date: 'Date', to: 'To', dear: 'Dear', title: 'LOAN AGREEMENT: SINGER CREDIT', intro: 'Thank you for choosing SINGER CREDIT. We are pleased to confirm your loan on the following terms.', item: 'Goods', desc: 'Description', cash: 'Cash price', down: 'Down payment', loan: 'Loan amount', charges: 'Charges', inst: 'Instalment', total: 'Total payable', important: 'IMPORTANT INFORMATION', facility: 'Facility', tenor: 'Tenor', due: 'Due date', pay: 'Payment terms', late: 'Late payment', settle: 'Early settlement', disb: 'Disbursement', schedule: 'Repayment schedule', no: 'No.', amount: 'Instalment amount', cust: 'Customer', singer: 'For SINGER (SRI LANKA) PLC', signed: 'Digitally signed', awaiting: 'Awaiting e-signature', months: 'months', thanks: 'We trust this meets your approval.', regards: 'Very truly yours',
    facilityV: 'SINGER CREDIT instalment loan', dueV: d => `Day ${d} of each month (adjusted for weekends and public holidays)`, payV: 'Direct debit from your verified bank account', lateV: 'Grace period, late fee and penal interest apply as set out in SINGER policy, within system caps', settleV: 'Allowed at any time; unearned service charges are rebated', disbV: 'Paid directly to SINGER against your order. No cash is paid to you.', goodsV: p => `${p}`, clauses: ['This agreement takes effect only after you sign it. No loan proceeds are released without a signed agreement.', 'The loan is for the purchase of the SINGER goods above and is activated on the order event agreed with SINGER.', 'You may request a one-time change of due date, subject to approval.'] },
  si: { ref: 'යොමුව', date: 'දිනය', to: 'වෙත', dear: 'ආයුබෝවන්', title: 'ණය ගිවිසුම: SINGER CREDIT', intro: 'SINGER CREDIT තෝරාගැනීම ගැන ස්තූතියි. ඔබේ ණය පහත කොන්දේසි යටතේ තහවුරු කිරීමට සතුටු වෙමු.', item: 'භාණ්ඩ', desc: 'විස්තරය', cash: 'මුදල් මිල', down: 'මූලික ගෙවීම', loan: 'ණය මුදල', charges: 'ගාස්තු', inst: 'වාරිකය', total: 'ගෙවිය යුතු මුළු මුදල', important: 'වැදගත් තොරතුරු', facility: 'පහසුකම', tenor: 'කාලය', due: 'නියමිත දිනය', pay: 'ගෙවීම් කොන්දේසි', late: 'ප්‍රමාද ගෙවීම්', settle: 'කල් ඉක්මවා පියවීම', disb: 'මුදල් නිදහස් කිරීම', schedule: 'ආපසු ගෙවීමේ කාලසටහන', no: 'අංකය', amount: 'වාරික මුදල', cust: 'පාරිභෝගිකයා', singer: 'SINGER (ශ්‍රී ලංකා) PLC වෙනුවෙන්', signed: 'ඩිජිටල් අත්සන', awaiting: 'ඊ-අත්සන බලාපොරොත්තුවෙන්', months: 'මාස', thanks: 'මෙය ඔබට පිළිගත හැකි වනු ඇතැයි අපි විශ්වාස කරමු.', regards: 'මෙයට විශ්වාසී',
    facilityV: 'SINGER CREDIT වාරික ණය', dueV: d => `සෑම මාසයකම ${d} වන දින (සති අන්ත සහ නිවාඩු දින සඳහා ගැලපේ)`, payV: 'ඔබේ තහවුරු කළ බැංකු ගිණුමෙන් සෘජු හර කිරීම', lateV: 'SINGER ප්‍රතිපත්තියට අනුව වරප්‍රසාද කාලය, ප්‍රමාද ගාස්තු සහ දඩ පොලිය අදාළ වේ', settleV: 'ඕනෑම වේලාවක කළ හැක; නොඋපයා ඇති ගාස්තු ආපසු අඩු කෙරේ', disbV: 'ඔබේ ඇණවුමට එරෙහිව කෙලින්ම SINGER වෙත ගෙවේ. ඔබට මුදල් ගෙවනු නොලැබේ.', goodsV: p => `${p}`, clauses: ['ඔබ අත්සන් කළ පසුව පමණක් මෙම ගිවිසුම බලපැවැත්වේ.', 'මෙම ණය ඉහත SINGER භාණ්ඩ මිලදී ගැනීම සඳහා වන අතර ඇණවුම් සිදුවීමේදී සක්‍රිය වේ.', 'නියමිත දිනය එක් වරක් පමණක් අනුමැතිය සහිතව වෙනස් කළ හැක.'] },
  ta: { ref: 'குறிப்பு', date: 'தேதி', to: 'பெறுநர்', dear: 'அன்புடையீர்', title: 'கடன் ஒப்பந்தம்: SINGER CREDIT', intro: 'SINGER CREDIT ஐத் தேர்ந்தெடுத்தமைக்கு நன்றி. உங்கள் கடனை பின்வரும் நிபந்தனைகளில் உறுதிப்படுத்த மகிழ்கிறோம்.', item: 'பொருட்கள்', desc: 'விவரம்', cash: 'ரொக்க விலை', down: 'முன்பணம்', loan: 'கடன் தொகை', charges: 'கட்டணங்கள்', inst: 'தவணை', total: 'மொத்தச் செலுத்தல்', important: 'முக்கிய தகவல்', facility: 'வசதி', tenor: 'காலம்', due: 'செலுத்தும் தேதி', pay: 'செலுத்தும் முறை', late: 'தாமதக் கட்டணம்', settle: 'முன்கூட்டிய தீர்வு', disb: 'தொகை விடுவிப்பு', schedule: 'திருப்பிச் செலுத்தும் அட்டவணை', no: 'எண்', amount: 'தவணைத் தொகை', cust: 'வாடிக்கையாளர்', singer: 'SINGER (ஸ்ரீலங்கா) PLC சார்பாக', signed: 'டிஜிட்டல் கையொப்பம்', awaiting: 'மின்-கையொப்பத்திற்காக காத்திருக்கிறது', months: 'மாதங்கள்', thanks: 'இது உங்களுக்கு ஏற்புடையது என நம்புகிறோம்.', regards: 'தங்கள் உண்மையுள்ள',
    facilityV: 'SINGER CREDIT தவணைக் கடன்', dueV: d => `ஒவ்வொரு மாதமும் ${d} ஆம் தேதி (வார இறுதி, விடுமுறைக்கு ஏற்ப மாறும்)`, payV: 'சரிபார்க்கப்பட்ட வங்கிக் கணக்கிலிருந்து நேரடிப் பற்று', lateV: 'SINGER கொள்கைப்படி சலுகை காலம், தாமதக் கட்டணம், அபராத வட்டி பொருந்தும்', settleV: 'எப்போதும் செய்யலாம்; ஈட்டப்படாத கட்டணங்கள் திருப்பி வழங்கப்படும்', disbV: 'உங்கள் ஆர்டருக்காக நேரடியாக SINGER க்கு செலுத்தப்படும். உங்களுக்கு பணம் வழங்கப்படாது.', goodsV: p => `${p}`, clauses: ['நீங்கள் கையொப்பமிட்ட பின்பே இந்த ஒப்பந்தம் அமலுக்கு வரும்.', 'இந்தக் கடன் மேற்கண்ட SINGER பொருட்களை வாங்குவதற்கானது; ஆர்டர் நிகழ்வில் செயல்படுத்தப்படும்.', 'செலுத்தும் தேதியை ஒருமுறை மட்டும், ஒப்புதலுடன் மாற்றலாம்.'] }
};

function agreementDoc(l) {
  const lg = l.agreement.lang, D = DOC[lg] || DOC.en, c = l.customer;
  const today = fmtDate(l.agreement.sentAt);
  const rows = l.schedule.rows;
  const first = rows[0];
  return `<div class="doc-bar"><span class="muted small">Agreement language: <b>${lg.toUpperCase()}</b> · template ${esc(l.agreement.templateVersion)}</span><span class="sp"></span>${l.agreement.signedAt ? tag('Signed ' + l.agreement.signedAt + ' · ' + l.agreement.docRef, 'ok') : tag('Awaiting e-signature', 'warn')}${btn('Print / Save as PDF', 'print', '', 'sm')}</div>
  <div class="doc"><div class="doc-head"><div class="doc-ref"><b>${D.ref}: SCL-${esc(l.id)}</b><br>${today}</div><div class="doc-logo">SINGER</div></div>
    <p style="margin-top:26px">${D.to}: <b>${esc(c.name)}</b><br>NIC ${esc(c.nic)}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
    <p>${D.dear} ${esc(c.name)},</p>
    <div class="doc-title">${D.title}</div>
    <p>${D.intro}</p>
    <table><tr><th>${D.item}</th><th>${D.desc}</th><th class="r">${D.cash}</th><th class="r">${D.down}</th><th class="r">${D.loan}</th><th class="r">${D.charges}</th><th class="r">${D.inst}</th><th class="r">${D.total}</th></tr>
      <tr><td><b>${esc(l.order.id)}</b></td><td>${esc(l.product)}<br>${l.tenor} ${D.months}${l.promo ? ' · ' + esc(l.promo) : ''}</td><td class="r">${lkr0(l.cashPrice - l.saleDiscount)}</td><td class="r">${lkr0(l.downPayment)}</td><td class="r">${lkr0(l.principal)}</td><td class="r">${lkr0(l.charge + l.fee)}</td><td class="r">${lkr0(l.instalment)}</td><td class="r"><b>${lkr0(l.total + l.downPayment)}</b></td></tr></table>
    <div class="doc-box">${D.important}</div>
    <dl><dt>${D.facility}</dt><dd>${D.facilityV}</dd><dt>${D.tenor}</dt><dd>${l.tenor} ${D.months}</dd><dt>${D.due}</dt><dd>${D.dueV(first ? first.nominal.slice(8) : l.dueDay)}</dd><dt>${D.pay}</dt><dd>${D.payV}</dd><dt>${D.late}</dt><dd>${D.lateV}</dd><dt>${D.settle}</dt><dd>${D.settleV}</dd><dt>${D.disb}</dt><dd>${D.disbV}</dd></dl>
    <h3>${D.schedule}</h3>
    <table><tr><th>${D.no}</th><th>${D.due}</th><th class="r">${D.amount}</th></tr>${rows.map(r => `<tr><td>${r.no}</td><td>${r.due}</td><td class="r">LKR ${lkr(r.principal + r.charge + r.fee)}</td></tr>`).join('')}</table>
    <ol>${D.clauses.map(x => `<li>${x}</li>`).join('')}</ol>
    <p style="margin-top:22px">${D.thanks}</p><p>${D.regards},</p>
    <div class="doc-sign"><div><div class="signed">${l.agreement.signedAt ? '✔ ' + D.signed + '<br><span style="font-weight:400;font-size:12px">' + esc(l.agreement.docRef) + ' · ' + l.agreement.signedAt + '</span>' : D.awaiting}</div><div class="line"><b>${D.cust}</b><br>${esc(c.name)}</div></div>
      <div><div class="signed" style="color:#1a1a1a"></div><div class="line"><b>${D.singer}</b><br>Authorised signatory</div></div></div>
    <div class="doc-foot">SINGER (SRI LANKA) PLC · SINGER CREDIT · Agreement ${esc(l.agreement.templateVersion)}</div></div>`;
}

// ----------------------------------------------------------------- disbursements
VIEWS.disbursements = async () => {
  const rows = await api('disbursements');
  const released = rows.filter(r => r.stage === 'released');
  const pending = rows.filter(r => r.stage !== 'released');
  const sum = a => a.reduce((t, r) => t + r.amount, 0);
  const stageTag = r => r.stage === 'released' ? tag('Released', 'ok') : r.stage === 'pending_delivery' ? tag('Pending delivery', 'warn') : tag('Awaiting signature', 'info');
  const kpi = (cls, ic, label, val, help) => `<div class="card kpi ${cls}"><span class="ic">${icon(ic)}</span><div class="lbl">${label}</div><div class="val"><small>LKR</small>${lkr0(val)}</div><div class="help">${help}</div></div>`;
  return `${head('Disbursements', 'Loan proceeds are paid to SINGER against the customer\'s order. No cash goes to the customer.')}
  <div class="grid g3">${kpi('green', 'disb', 'Released to SINGER', sum(released), released.length + (released.length === 1 ? ' loan' : ' loans'))}${kpi('amber', 'loans', 'Pending release', sum(pending), pending.length + (pending.length === 1 ? ' loan waiting' : ' loans waiting'))}${kpi('blue', 'reports', 'Total pipeline', sum(rows), 'Approved, signed and released')}</div>
  <div class="card" style="margin-top:20px"><div class="sect">Disbursement register</div><table><tr><th>Loan</th><th>Customer</th><th>Order</th><th class="r">Amount</th><th>Stage</th><th>Reference</th><th></th></tr>
  ${rows.map(r => `<tr><td><a href="#" data-act="open-loan" data-id="${r.loan}"><b>${r.loan}</b></a><div class="sub">${esc(r.product)}</div></td><td>${esc(r.customer)}</td><td>${esc(r.order)}</td><td class="r"><b>LKR ${lkr0(r.amount)}</b></td><td>${stageTag(r)}${r.date ? `<div class="sub">${r.date}</div>` : ''}</td><td class="muted">${esc(r.reference) || '-'}</td>
  <td class="r">${r.stage === 'pending_delivery' ? btn('Release on delivery', 'release', `data-id="${r.loan}"`, 'sm pri') : r.stage === 'awaiting_signature' ? '<span class="muted small">Needs signed agreement</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No disbursements yet.</td></tr>'}</table></div>`;
};

// ----------------------------------------------------------------- user guide (SOP)
function md(src) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of src.split('\n')) {
    let m;
    if ((m = line.match(/^(#{1,3}) (.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim() === '') close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('');
}
VIEWS.guide = async () => `<div class="guide">${md(await api('sop'))}</div>`;

// ----------------------------------------------------------------- actions
function field(id, label, type = 'text', v = '') { return `<div><label>${label}</label><input id="${id}" type="${type}" value="${esc(v)}"></div>`; }
const val = id => $('#' + id).value;
const dlg = (title, body, ok) => modal(`<h2>${title}</h2>${body}<div class="row" style="margin-top:22px;justify-content:flex-end">${btn('Cancel', 'close')}${ok}</div>`);
const menuItem = (label, hint, act, attrs) => `<button data-act="${act}" ${attrs}>${label}<small>${hint}</small></button>`;

const ACTIONS = {
  nav: el => { closeModal(); return go(el.dataset.view); },
  close: () => closeModal(),
  'open-loan': async el => { closeModal(); S.loanTab = 'overview'; await go('loan', el.dataset.id); },
  advance: async el => { await api('advance', +el.dataset.days); toast(`Moved ${el.dataset.days} day(s) forward. Direct debits, penalties and reminders ran.`); await go(S.view); },
  reset: async () => { await api('reset'); S.draft = null; Object.assign(W, { step: 1, quote: null, kyc: null, result: null }); toast('Demo data reset'); await go('dashboard'); },
  'wiz-next': () => wizNext(),
  'wiz-back': async () => { W.step = 1; await go('apply'); },
  'wiz-new': async () => { S.draft = null; Object.assign(W, { step: 1, quote: null, kyc: null, result: null }); await go('apply'); },
  print: () => window.print(),
  release: async el => { await api('orderEvent', el.dataset.id, 'delivered', {}); toast('Delivery confirmed. Proceeds released to SINGER.'); await go('disbursements'); },
  pick: el => { document.querySelectorAll('.plan').forEach(o => o.classList.remove('sel')); el.classList.add('sel'); S.draft.tenor = +el.dataset.tenor; $('#picked').textContent = `${el.dataset.tenor}-month plan selected`; $('#submitBtn').disabled = false; },
  'submit-app': () => doSubmit(),
  decide: async el => {
    const id = el.dataset.id;
    await api('decide', id, { decision: el.dataset.d, user: 'underwriter.demo', role: val('role-' + id), note: val('note-' + id) });
    toast(el.dataset.d === 'approve' ? 'Approved. The loan is now ready for its agreement.' : 'Application declined'); await go('queue');
  },
  agreement: async el => { await api('agreement', el.dataset.id, S.lang); toast('Agreement sent to the e-signature system'); await go('loan'); },
  sign: async el => { await api('sign', el.dataset.id); toast('Signed agreement received'); await go('loan'); },
  order: async el => { await api('orderEvent', el.dataset.id, el.dataset.ev, {}); toast('Order delivered. Loan is active and proceeds go to SINGER.'); await go('loan'); },
  more: el => {
    const id = `data-id="${el.dataset.id}"`;
    modal(`<h2>More actions</h2><div class="menu">${menuItem('Settlement quote', 'Quote and close the loan early', 'settle-quote', id)}${menuItem('Partial settlement', 'Pay down principal, rebate unearned charge', 'partial-modal', id)}${menuItem('Goods return', 'Recalculate the schedule and restore the limit', 'return-modal', id)}${menuItem('Change due date', 'One-time change with approval', 'due-modal', id)}${menuItem('Cancel loan', 'Only before activation', 'cancel-loan', id)}</div><div class="row" style="margin-top:14px;justify-content:flex-end">${btn('Close', 'close')}</div>`);
  },
  'cancel-loan': async el => { closeModal(); await api('cancel', el.dataset.id); toast('Loan cancelled and credit limit released'); await go('loan'); },
  'pay-modal': el => dlg(`Post payment · ${el.dataset.id}`, `<div class="form">${field('m-amt', 'Amount (LKR)', 'number', 10000)}<div><label>Channel</label><select id="m-ch"><option>branch</option><option>card</option><option>lankaqr</option><option>bank_transfer</option></select></div></div>`, btn('Post payment', 'pay', `data-id="${el.dataset.id}"`, 'pri')),
  pay: async el => { const p = await api('pay', el.dataset.id, { amount: +val('m-amt'), channel: val('m-ch') }); closeModal(); toast('Payment applied: ' + p.allocations.slice(0, 3).map(a => `${a.comp} ${lkr0(a.amount)}`).join(', ')); await go('loan'); },
  reverse: async el => { await api('reverse', el.dataset.id, el.dataset.pay, 'ops.checker', 'Incorrectly posted'); toast('Payment reversed with approval'); await go('loan'); },
  'settle-quote': async el => {
    const q = await api('settleQuote', el.dataset.id); const b = q.breakdown;
    modal(`<h2>Settlement quote</h2><p class="muted" style="margin-top:0">Valid until ${q.validUntil}</p><table><tr><td>Due and overdue (with penalties)</td><td class="r">${lkr(b.overdueAndDue)}</td></tr><tr><td>Remaining principal</td><td class="r">${lkr(b.remainingPrincipal)}</td></tr><tr><td>Remaining fees and charges</td><td class="r">${lkr(b.remainingFees + b.remainingCharges)}</td></tr><tr><td>Unearned charge rebate</td><td class="r">− ${lkr(b.unearnedChargeRebate)}</td></tr><tr><td>Settlement discount</td><td class="r">− ${lkr(b.settlementDiscount)}</td></tr></table>
    <div class="row" style="margin-top:18px"><span class="muted">Settle today</span><span class="sp"></span><span class="big">LKR ${lkr(q.amount)}</span></div>
    <div class="row" style="margin-top:22px;justify-content:flex-end">${btn('Close', 'close')}${btn('Collect and settle', 'settle', `data-id="${el.dataset.id}" data-q="${q.id}"`, 'pri')}</div>`);
  },
  settle: async el => { await api('settle', el.dataset.id, el.dataset.q); closeModal(); toast('Loan settled and closed'); await go('loan'); },
  'partial-modal': el => dlg('Partial settlement', `<p class="muted" style="margin-top:0">Dues are cleared first. The rest reduces principal, and the unearned charge on it is rebated.</p>${field('m-amt', 'Amount (LKR)', 'number', 30000)}`, btn('Apply', 'partial', `data-id="${el.dataset.id}"`, 'pri')),
  partial: async el => { const r = await api('partial', el.dataset.id, +val('m-amt')); closeModal(); toast('Applied. Charge rebated: LKR ' + lkr0(r.chargeReduced)); await go('loan'); },
  'return-modal': el => dlg('Goods return', `<p class="muted" style="margin-top:0">The schedule is recalculated on the revised value and the credit limit is restored.</p><div class="form">${field('m-val', 'Returned value (LKR)', 'number', 50000)}${field('m-why', 'Reason', 'text', 'Faulty item')}</div>`, btn('Approve return', 'return', `data-id="${el.dataset.id}"`, 'pri')),
  return: async el => { const r = await api('returnGoods', el.dataset.id, +val('m-val'), 'ops.checker', val('m-why')); closeModal(); toast(`New instalment LKR ${lkr0(r.revisedInstalment)} · refund due LKR ${lkr0(r.refund)}`); await go('loan'); },
  'due-modal': el => dlg('Change due date', `<p class="muted" style="margin-top:0">One change per loan, with approval.</p><label>New day of month</label><select id="m-day">${S.policy.dueDay.allowedDays.map(d => `<option>${d}</option>`).join('')}</select>`, btn('Approve change', 'due', `data-id="${el.dataset.id}"`, 'pri')),
  due: async el => { await api('dueDate', el.dataset.id, +val('m-day'), 'ops.checker'); closeModal(); toast('Due date changed. Earlier schedule kept as history.'); await go('loan'); },
  waive: async el => { const w = await api('waive', el.dataset.id, +el.dataset.no, 100000, 'credit.manager', 'Goodwill'); toast(`Waived LKR ${lkr0(w)} through the approval workflow`); await go('loan'); },
  contact: el => dlg('Log contact', `<div class="form"><div><label>Outcome</label><select id="m-out"><option>Promised to pay</option><option>No answer</option><option>Disputed</option><option>Wrong number</option></select></div>${field('m-note', 'Note')}</div>`, btn('Save', 'contact-save', `data-id="${el.dataset.id}"`, 'pri')),
  'contact-save': async el => { await api('contact', el.dataset.id, { outcome: val('m-out'), note: val('m-note'), user: 'agent.demo' }); closeModal(); toast('Contact logged'); await go('collections'); },
  ptp: el => dlg('Promise to pay', `<div class="form">${field('m-date', 'Promise date', 'date', S.clock)}${field('m-amt', 'Amount (LKR)', 'number', 20000)}</div>`, btn('Save', 'ptp-save', `data-id="${el.dataset.id}"`, 'pri')),
  'ptp-save': async el => { await api('ptp', el.dataset.id, { date: val('m-date'), amount: +val('m-amt'), user: 'agent.demo' }); closeModal(); toast('Promise recorded'); await go('collections'); },
  'coll-more': el => modal(`<h2>More actions</h2><div class="menu">${menuItem('Restructure', 'Extend the remaining schedule, with approval', 'restructure', `data-id="${el.dataset.id}"`)}${menuItem('Write off', 'Uncollectable, with approval; blocks the customer', 'writeoff', `data-id="${el.dataset.id}"`)}</div><div class="row" style="margin-top:14px;justify-content:flex-end">${btn('Close', 'close')}</div>`),
  restructure: el => dlg('Restructure', `<p class="muted" style="margin-top:0">Approval required.</p>${field('m-mon', 'Extra months', 'number', 3)}`, btn('Approve', 'restructure-save', `data-id="${el.dataset.id}"`, 'pri')),
  'restructure-save': async el => { await api('restructure', el.dataset.id, +val('m-mon'), 'collections.head', 'Hardship'); closeModal(); toast('Loan restructured'); await go('collections'); },
  writeoff: el => dlg('Write off loan', `<p style="margin-top:0">Write off ${el.dataset.id}? This needs approval and blocks the customer.</p>`, btn('Approve write-off', 'writeoff-save', `data-id="${el.dataset.id}"`, 'pri')),
  'writeoff-save': async el => { await api('writeOff', el.dataset.id, 'finance.head', 'Uncollectable'); closeModal(); toast('Written off with approval'); await go('collections'); },
  limit: async el => { await api('limitAction', el.dataset.nic, el.dataset.a); toast('Credit limit ' + (el.dataset.a === 'freeze' ? 'frozen' : 'reactivated')); await go('customers'); },
  'save-policy': async () => {
    const p = S.policy;
    const patch = { graceDays: +val('p-grace'), lateFee: +val('p-late'), penalRatePerMonth: +val('p-penal') / 100, settlement: Object.assign({}, p.settlement, { discountPct: +val('p-disc') / 100 }) };
    await api('updatePolicy', patch, val('p-eff')); toast('New policy version saved'); await go('policy');
  },
  export: async el => {
    let rows;
    if (el.dataset.n === 'loan-book') rows = (await api('loans')).map(l => ({ loan: l.id, customer: l.customerName, product: l.product, status: l.status, principal: l.principal, outstanding: l.outstanding, dpd: l.dpd }));
    else rows = (await api('dashboard')).exposures;
    toast('Saved ' + await api('exportCsv', el.dataset.n, rows));
  }
};

document.addEventListener('click', async e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); return go(nav.dataset.nav); }
  const lang = e.target.closest('[data-lang]');
  if (lang) { S.lang = lang.dataset.lang; await refreshChrome(); if (S.view === 'apply' && W.step === 2) return go('apply'); if (S.view === 'loan') return go('loan'); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { S.loanTab = tab.dataset.tab; return go('loan'); }
  const atab = e.target.closest('[data-atab]');
  if (atab) { S.auditTab = atab.dataset.atab; return go('audit'); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) { try { await fn(el); } catch (err) { /* already toasted */ } }
});

go('dashboard');
