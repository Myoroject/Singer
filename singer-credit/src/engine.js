'use strict';
const { addDays, addMonths, diffDays, r2, parseNic, ageOn, d, iso } = require('./util');
const { DEFAULT_POLICY, policyAt, validatePolicy } = require('./policy');
const { LABELS, render, lkr } = require('./i18n');

const TIER_ORDER = ['A', 'B', 'C', 'D'];
const COMPS = ['penalty', 'fee', 'charge', 'principal'];

function newState(today) {
  return {
    clock: today,
    seq: { loan: 1000, app: 5000, pay: 1, quote: 1, doc: 1 },
    policy: { versions: [{ effective: '2020-01-01', data: JSON.parse(JSON.stringify(DEFAULT_POLICY)) }] },
    customers: {}, applications: {}, loans: {}, audit: [], outbox: [], ifsPostings: []
  };
}

const nextId = (state, k, prefix) => prefix + (state.seq[k]++);
const clone = o => JSON.parse(JSON.stringify(o));
const pol = state => policyAt(state, state.clock);

function audit(state, actor, action, entity, before, after, note) {
  state.audit.push({ id: state.audit.length + 1, at: state.clock, actor, action, entity, before: before === undefined ? null : clone(before), after: after === undefined ? null : clone(after), note: note || '' });
}

function notify(state, event, loan, lang, vars) {
  const c = state.customers[loan.nic];
  const language = lang || (c && c.lang) || 'en';
  const v = Object.assign({ name: c ? c.name : '', loan: loan.id, amount: '' }, vars);
  const text = render(event, language, v);
  for (const channel of ['sms', 'push']) state.outbox.push({ at: state.clock, event, channel, lang: language, nic: loan.nic, loan: loan.id, text });
}

// ---------------------------------------------------------------- customers (LM-01)
function registerCustomer(state, input, actor = 'api') {
  const parsed = parseNic(input.nic);
  if (!parsed) throw new Error('Invalid NIC');
  const existing = state.customers[parsed.nic];
  if (existing) {
    const before = clone(existing);
    Object.assign(existing, { name: input.name || existing.name, phone: input.phone || existing.phone, email: input.email || existing.email });
    audit(state, actor, 'customer.update', parsed.nic, before, existing);
    return existing;
  }
  const c = {
    nic: parsed.nic, dob: parsed.dob, gender: parsed.gender, name: input.name, phone: input.phone || '', email: input.email || '',
    lang: input.lang || 'en', ekyc: { status: input.ekyc || 'verified', ref: input.ekycRef || 'EKYC-' + parsed.nic },
    bank: { verified: input.bankVerified !== false, mandate: input.mandate || 'active', name: input.bankName || 'Commercial Bank' },
    ifs: Object.assign({ hpOutstanding: 0, hpDelinquent: false, onTimePayments: 0, latePayments: 0, purchases: 0, tenureMonths: 0 }, input.ifs),
    sim: Object.assign({ autoPay: true }, input.sim),
    creditLimit: 0, limitStatus: 'unassessed', tier: null, score: null, limitReview: null, blocked: false
  };
  state.customers[c.nic] = c;
  audit(state, actor, 'customer.register', c.nic, null, c);
  return c;
}

// ---------------------------------------------------------------- scoring (LM-03/04)
function scoreDocuments(docs) {
  const income = Number(docs.monthlyIncome) || 0;
  const obligations = Number(docs.monthlyObligations) || 0;
  const foir = income > 0 ? obligations / income : 1;
  const tamper = Number(docs.tamperRisk) || 0;
  return {
    extracted: { monthlyIncome: income, monthlyObligations: obligations, salaryRegularMonths: Number(docs.salaryMonthsRegular) || 0, foir: r2(foir) },
    perDocument: [
      { doc: 'Bank statement', riskScore: Math.min(100, Math.round(tamper * 0.8)), tamperFlag: tamper >= 70 },
      { doc: 'Salary slip', riskScore: Math.min(100, Math.round(tamper)), tamperFlag: tamper >= 70 },
      { doc: 'Income statement', riskScore: Math.min(100, Math.round(tamper * 0.6)), tamperFlag: tamper >= 70 }
    ],
    tamperRisk: tamper
  };
}

function scoreCustomer(state, nic, docs) {
  const c = state.customers[nic];
  const p = pol(state);
  const ex = scoreDocuments(docs);
  const { monthlyIncome: income, foir, salaryRegularMonths: reg } = ex.extracted;
  const f = [];
  const add = (factor, points, max, detail) => f.push({ factor, points: r2(points), max, detail });
  add('Debt burden (FOIR)', foir < 0.2 ? 30 : foir < 0.35 ? 22 : foir < 0.5 ? 12 : 3, 30, `FOIR ${(foir * 100).toFixed(0)}%`);
  add('Income level', income >= 150000 ? 15 : income >= 80000 ? 12 : income >= 40000 ? 8 : 4, 15, `LKR ${income.toLocaleString()} / month`);
  add('Salary regularity', Math.min(6, reg) / 6 * 20, 20, `${reg} of last 6 months regular`);
  const hist = c.ifs.onTimePayments + c.ifs.latePayments;
  add('SINGER HP / purchase history (IFS)', (hist ? c.ifs.onTimePayments / hist * 20 : 10) + Math.min(5, c.ifs.purchases), 25,
    hist ? `${c.ifs.onTimePayments}/${hist} on time, ${c.ifs.purchases} purchases` : 'No repayment history');
  add('Document integrity', (100 - ex.tamperRisk) / 100 * 10, 10, `Tamper risk ${ex.tamperRisk}`);
  const score = r2(f.reduce((s, x) => s + x.points, 0));
  const cut = p.tierCutoffs;
  const tier = score >= cut.A ? 'A' : score >= cut.B ? 'B' : score >= cut.C ? 'C' : 'D';
  return { score, tier, factors: f, documents: ex, modelVersion: 'rules-v1' };
}

// Assign / review the credit limit (LM-15)
function assessLimit(state, nic, docs, actor = 'credit.officer') {
  const c = state.customers[nic];
  const r = scoreCustomer(state, nic, docs);
  const before = clone(c);
  const limit = pol(state).tiers[r.tier].limit;
  const action = c.limitStatus === 'unassessed' ? 'assigned' : limit > c.creditLimit ? 'increased' : limit < c.creditLimit ? 'decreased' : 'confirmed';
  c.score = r.score; c.tier = r.tier; c.creditLimit = limit;
  if (c.limitStatus === 'unassessed' || c.limitStatus === 'expired') c.limitStatus = limit > 0 ? 'active' : 'suspended';
  c.limitReview = { date: state.clock, next: addMonths(state.clock, 12), action };
  c.lastAssessment = r;
  audit(state, actor, 'limit.' + action, nic, before, c);
  return { customer: c, assessment: r };
}

function setLimit(state, nic, action, actor = 'credit.officer') {
  const c = state.customers[nic];
  const before = clone(c);
  if (action === 'freeze') c.limitStatus = 'frozen';
  else if (action === 'reactivate') c.limitStatus = 'active';
  else if (action === 'expire') c.limitStatus = 'expired';
  else throw new Error('Unknown limit action');
  audit(state, actor, 'limit.' + action, nic, before, c);
  return c;
}

// ---------------------------------------------------------------- exposure (LM-16)
function loanOutstanding(loan) {
  if (['settled', 'cancelled', 'written_off', 'declined'].includes(loan.status)) return 0;
  if (!loan.schedule) return 0;
  let t = 0;
  for (const r of loan.schedule.rows) for (const k of COMPS) t += r[k] - r.paid[k];
  return r2(t - loan.creditBalance);
}

function exposure(state, nic) {
  const c = state.customers[nic];
  let credit = 0, reserved = 0;
  for (const l of Object.values(state.loans)) {
    if (l.nic !== nic) continue;
    if (['approved', 'signed'].includes(l.status)) reserved += l.total; // pending orders are reserved
    else credit += loanOutstanding(l);
  }
  const hp = c.ifs.hpOutstanding;
  const total = r2(hp + credit + reserved);
  return { hp, credit: r2(credit), reserved: r2(reserved), total, limit: c.creditLimit, available: r2(Math.max(0, c.creditLimit - total)) };
}

// ---------------------------------------------------------------- eligibility (LM-02)
function eligibility(state, nic, { category, price, loanTotal }) {
  const c = state.customers[nic];
  const p = pol(state);
  const checks = [];
  const add = (rule, pass, detail) => checks.push({ rule, pass, detail });
  const age = ageOn(c.dob, state.clock);
  add('Minimum age 18', age >= 18, `Age ${age}`);
  add('e-KYC verified', c.ekyc.status === 'verified', `e-KYC ${c.ekyc.status} (${c.ekyc.ref})`);
  add('Bank account verified', c.bank.verified && c.bank.mandate === 'active', c.bank.verified ? `Direct-debit mandate ${c.bank.mandate}` : 'Bank account not verified');
  const delinquentCredit = Object.values(state.loans).some(l => l.nic === nic && l.status === 'in_arrears');
  add('No delinquent SINGER HP / BNPL accounts', !c.ifs.hpDelinquent && !delinquentCredit, c.ifs.hpDelinquent ? 'HP account delinquent in IFS' : delinquentCredit ? 'CREDIT loan in arrears' : 'Clean');
  add('Credit limit active', c.limitStatus === 'active', `Limit ${c.limitStatus}`);
  if (c.blocked) add('Customer not blocked', false, 'Blocked after write-off');
  if (loanTotal !== undefined) {
    const ex = exposure(state, nic);
    add('Sufficient available credit exposure', loanTotal <= ex.available, `Available ${lkr(ex.available)} vs requested ${lkr(loanTotal)} (HP ${lkr(ex.hp)}, CREDIT ${lkr(ex.credit)}, reserved ${lkr(ex.reserved)})`);
  }
  let hpOk = true, hpNote = 'No HP protection rule triggered';
  for (const rule of p.hpProtection) {
    if ((rule.category === '*' || rule.category === category) && price >= rule.minPrice && TIER_ORDER.indexOf(c.tier || 'D') > TIER_ORDER.indexOf(rule.requireTier)) {
      hpOk = false; hpNote = `${rule.note}: requires tier ${rule.requireTier} or better (customer tier ${c.tier || 'n/a'})`;
    }
  }
  add('HP protection rules', hpOk, hpNote);
  return { eligible: checks.every(x => x.pass), checks };
}

// ---------------------------------------------------------------- pricing & quotes (LM-06..10, LM-14)
function activePromo(state, code, product, tenor) {
  if (!code) return null;
  const promo = (state.promos || []).find(x => x.code === code.toUpperCase());
  if (!promo) return null;
  if (state.clock < promo.from || state.clock > promo.to) return null;
  if (promo.products && !promo.products.includes(product)) return null;
  if (tenor && promo.tenors && !promo.tenors.includes(tenor)) return null;
  return promo;
}

function priceOption(state, { cashPrice, downPayment, product, tier, promoCode, tenor }) {
  const p = pol(state);
  const t = p.tiers[tier];
  const promo = activePromo(state, promoCode, product, tenor);
  const saleDiscount = promo && promo.saleDiscountPct ? r2(cashPrice * promo.saleDiscountPct) : 0;
  const price = r2(cashPrice - saleDiscount);
  const principal = r2(price - downPayment);
  const rate = promo && promo.annualFlatOverride !== undefined ? promo.annualFlatOverride : t.annualFlat;
  const charge = r2(principal * rate * tenor / 12);
  const feeWaived = promo && promo.feeWaived;
  const fee = feeWaived ? 0 : r2(Math.max(p.minProcessingFee, principal * p.processingFeePct));
  const total = r2(principal + charge + fee);
  const step = p.rounding;
  let instalment = Math.ceil(total / tenor / step) * step;
  const lastInstalment = r2(total - instalment * (tenor - 1));
  return { tenor, cashPrice, saleDiscount, downPayment, principal, annualFlatRate: rate, charge, fee, total, instalment, lastInstalment, promo: promo ? promo.code : null };
}

function quote(state, { nic, product, cashPrice, downPayment = 0, promoCode, lang }) {
  const c = state.customers[nic];
  const p = pol(state);
  const tier = c.tier || 'C';
  const t = p.tiers[tier];
  const prod = p.products[product];
  if (!prod) throw new Error('Unknown product category');
  const minDown = r2(cashPrice * t.minDownPct);
  const notes = [];
  if (downPayment < minDown) notes.push(`Minimum down payment for tier ${tier} is ${lkr(minDown)}`);
  const options = [];
  for (const tenor of t.tenors) {
    const o = priceOption(state, { cashPrice, downPayment, product, tier, promoCode, tenor });
    o.withinProductLimits = o.principal >= prod.min && o.principal <= prod.max;
    const ex = exposure(state, nic);
    o.withinCreditLimit = o.total <= ex.available;
    o.labels = {};
    for (const lg of ['en', 'si', 'ta']) {
      const L = LABELS[lg];
      o.labels[lg] = [
        [L.cashPrice, lkr(o.cashPrice - o.saleDiscount)], [L.downPayment, lkr(o.downPayment)], [L.loanAmount, lkr(o.principal)],
        [L.charges, lkr(o.charge + o.fee)], [L.instalment, `${lkr(o.instalment)} × ${o.tenor} ${L.months}`], [L.totalRepayable, lkr(o.total + o.downPayment)]
      ];
    }
    options.push(o);
  }
  return { nic, tier, minDownPayment: minDown, downPaymentOk: downPayment >= minDown, notes, options, productLimits: prod };
}

// ---------------------------------------------------------------- schedule (LM-11, LM-12)
function isBusinessDay(p, s) {
  const dt = d(s);
  const wd = dt.getUTCDay();
  const md = s.slice(5);
  return wd !== 0 && wd !== 6 && !p.holidays.includes(md);
}
function nextBusinessDay(p, s) { let x = s; while (!isBusinessDay(p, x)) x = addDays(x, 1); return x; }

function buildRows(state, loan, start, count) {
  const p = pol(state);
  const rows = [];
  const day = loan.dueDay;
  // Each instalment is the quoted (rounded-up) amount; the last absorbs the rounding difference.
  let pp = 0, cc = 0, ff = 0, paidTotal = 0;
  for (let i = 0; i < count; i++) {
    const nominal = addMonths(start, 1 + i, day);
    const last = i === count - 1;
    const T = last ? r2(loan.total - paidTotal) : loan.instalment;
    paidTotal += T;
    const principal = last ? r2(loan.principal - pp) : r2(T * loan.principal / loan.total);
    const charge = last ? r2(loan.charge - cc) : r2(T * loan.charge / loan.total);
    const fee = last ? r2(loan.fee - ff) : r2(T - principal - charge);
    pp += principal; cc += charge; ff += fee;
    rows.push({ no: 1 + i, nominal, due: nextBusinessDay(p, nominal), principal, charge, fee, penalty: 0, paid: { penalty: 0, fee: 0, charge: 0, principal: 0 }, lateFeeCharged: false, lastAccrual: null });
  }
  return rows;
}

function generateSchedule(state, loan, start, reason) {
  const before = loan.schedule ? { version: loan.schedule.version, rows: loan.schedule.rows.length } : null;
  if (loan.schedule) loan.scheduleHistory.push({ version: loan.schedule.version, reason: loan.schedule.reason, at: loan.schedule.at, rows: clone(loan.schedule.rows) });
  const rows = buildRows(state, loan, start, loan.tenor);
  // Rounded instalment: keep ledger components but make instalment total match the quoted instalment where possible.
  loan.schedule = { version: loan.scheduleHistory.length + 1, reason, at: state.clock, rows };
  audit(state, 'system', 'schedule.generate', loan.id, before, { version: loan.schedule.version, reason });
}

function rowBase(r) { return r2(r.principal + r.charge + r.fee); }
function rowOwed(r, comps = COMPS) { return r2(comps.reduce((s, k) => s + r[k] - r.paid[k], 0)); }

// ---------------------------------------------------------------- application & decision (LM-19)
function createApplication(state, input, actor = 'website') {
  const c = state.customers[input.nic];
  if (!c) throw new Error('Customer not registered');
  const p = pol(state);
  const appId = nextId(state, 'app', 'APP-');
  const app = { id: appId, nic: input.nic, product: input.product, cashPrice: input.cashPrice, downPayment: input.downPayment || 0, promoCode: input.promoCode || null, tenor: input.tenor, lang: input.lang || c.lang, orderId: input.orderId || 'ORD-' + appId.slice(4), createdAt: state.clock, decisions: [], status: 'new' };
  state.applications[appId] = app;
  // fresh assessment from submitted documents
  const as = assessLimit(state, input.nic, input.docs || {}, 'decision.engine');
  const tier = as.assessment.tier;
  const tierCfg = p.tiers[tier];
  const reasons = [];
  const prod = p.products[input.product];
  const opt = tierCfg.tenors.includes(input.tenor) ? priceOption(state, { cashPrice: input.cashPrice, downPayment: app.downPayment, product: input.product, tier, promoCode: input.promoCode, tenor: input.tenor }) : null;
  if (!opt) reasons.push(`Tenor ${input.tenor} months is not available for tier ${tier}`);
  if (opt) {
    if (opt.principal < prod.min || opt.principal > prod.max) reasons.push(`Loan amount outside product limits (${lkr(prod.min)} - ${lkr(prod.max)})`);
    if (app.downPayment < r2(input.cashPrice * tierCfg.minDownPct)) reasons.push(`Down payment below tier minimum (${(tierCfg.minDownPct * 100).toFixed(0)}%)`);
  }
  const elig = eligibility(state, input.nic, { category: input.product, price: input.cashPrice, loanTotal: opt ? opt.total : undefined });
  for (const k of elig.checks) if (!k.pass) reasons.push(`${k.rule}: ${k.detail}`);
  const guarantorNeeded = opt && (opt.principal > p.guarantor.requiredAbove || p.guarantor.requiredForTiers.includes(tier));
  let guarantorCheck = null;
  if (guarantorNeeded) {
    if (!input.guarantor || !input.guarantor.nic || !input.guarantor.consent) reasons.push('Guarantor required: NIC, relationship and consent must be captured');
    else {
      const g = state.customers[input.guarantor.nic];
      const ok = g && !g.ifs.hpDelinquent && g.ifs.hpOutstanding < 100000;
      guarantorCheck = { nic: input.guarantor.nic, relationship: input.guarantor.relationship, consent: true, passed: !!ok, detail: g ? `HP outstanding ${lkr(g.ifs.hpOutstanding)}` : 'Guarantor not found in SINGER records' };
      if (!ok) reasons.push('Guarantor failed separate exposure check');
    }
  }
  const tamper = as.assessment.documents.tamperRisk >= 70;
  let outcome, refer = [];
  if (reasons.length) outcome = 'decline';
  else if (tier === 'D') { outcome = 'decline'; reasons.push('Risk tier D'); }
  else if (tamper) { outcome = 'refer'; refer.push('Document tamper suspected'); }
  else if (tier === 'C') { outcome = 'refer'; refer.push('Risk tier C requires manual assessment'); }
  else if (opt.principal > tierCfg.autoApproveMax) { outcome = 'refer'; refer.push(`Loan amount above auto-approval authority for tier ${tier} (${lkr(tierCfg.autoApproveMax)})`); }
  else outcome = 'approve';
  app.assessment = as.assessment;
  app.eligibility = elig;
  app.guarantor = guarantorCheck;
  app.option = opt;
  app.explain = { rules: elig.checks, scorecard: as.assessment.factors, tier, score: as.assessment.score, outcome, reasons, refer };
  audit(state, actor, 'application.create', appId, null, { nic: app.nic, product: app.product, cashPrice: app.cashPrice });
  audit(state, 'decision.engine', 'credit.decision', appId, null, app.explain);
  if (outcome === 'decline') { app.status = 'declined'; app.declineReasons = reasons; return { app, loan: null }; }
  if (outcome === 'refer') {
    app.status = 'referred'; app.referReasons = refer;
    app.sla = { dueBy: `${state.clock} +${p.slaHours}h`, hours: p.slaHours };
    return { app, loan: null };
  }
  const loan = approveApplication(state, app, 'decision.engine');
  return { app, loan };
}

function approveApplication(state, app, actor) {
  const opt = app.option;
  const c = state.customers[app.nic];
  const loan = {
    id: nextId(state, 'loan', 'LN-'), appId: app.id, nic: app.nic, product: app.product, lang: app.lang,
    cashPrice: opt.cashPrice, saleDiscount: opt.saleDiscount, downPayment: opt.downPayment, principal: opt.principal,
    annualFlatRate: opt.annualFlatRate, tenor: opt.tenor, charge: opt.charge, fee: opt.fee, total: opt.total, instalment: opt.instalment,
    tier: c.tier, promo: opt.promo, status: 'approved', timeline: [{ status: 'applied', at: app.createdAt }, { status: 'approved', at: state.clock, note: actor }],
    dueDay: parseInt(state.clock.slice(8), 10), scheduleHistory: [], schedule: null, payments: [], creditBalance: 0,
    order: { id: app.orderId, event: null }, agreement: null, ptp: [], contacts: [], settlementQuotes: [], frozen: false, downPaymentVerified: false, guarantor: app.guarantor
  };
  const allowed = pol(state).dueDay.allowedDays;
  if (pol(state).dueDay.rule === 'fixed_day') loan.dueDay = allowed.find(x => x >= loan.dueDay) || allowed[0];
  generateSchedule(state, loan, state.clock, 'initial (indicative)');
  state.loans[loan.id] = loan;
  app.status = 'approved'; app.loanId = loan.id;
  if (opt.saleDiscount > 0) state.ifsPostings.push({ at: state.clock, type: 'SALE_DISCOUNT', loan: loan.id, amount: opt.saleDiscount, promo: opt.promo });
  audit(state, actor, 'loan.approve', loan.id, null, { status: 'approved', total: loan.total });
  notify(state, 'approval', loan, loan.lang, { amount: lkr(loan.principal) });
  return loan;
}

function manualDecision(state, appId, { decision, user, role, note }) {
  const app = state.applications[appId];
  if (!app || app.status !== 'referred') throw new Error('Application is not in the underwriter queue');
  const p = pol(state);
  const limit = p.approvalAuthority[role] || 0;
  const before = clone(app);
  if (decision === 'approve') {
    if (app.option.principal > limit) throw new Error(`Approval authority exceeded: ${role} may approve up to ${lkr(limit)}`);
    app.decisions.push({ by: user, role, decision, note, at: state.clock });
    audit(state, user, 'application.manual_approve', appId, before, app, note);
    return { app, loan: approveApplication(state, app, user) };
  }
  app.status = 'declined'; app.declineReasons = [note || 'Declined by underwriter'];
  app.decisions.push({ by: user, role, decision, note, at: state.clock });
  audit(state, user, 'application.manual_decline', appId, before, app, note);
  const c = state.customers[app.nic];
  state.outbox.push({ at: state.clock, event: 'decline', channel: 'sms', lang: app.lang, nic: app.nic, loan: '', text: render('decline', app.lang, { name: c.name, reason: app.declineReasons[0] }) });
  return { app, loan: null };
}

// ---------------------------------------------------------------- agreement, e-sign, activation (LM-20..22)
const AGREEMENT_TEMPLATE_VERSION = 'AGR-2026.1';
function generateAgreement(state, loanId, lang) {
  const loan = state.loans[loanId];
  const L = LABELS[lang || loan.lang];
  const c = state.customers[loan.nic];
  const heads = { en: 'SINGER CREDIT LOAN AGREEMENT', si: 'SINGER CREDIT ණය ගිවිසුම', ta: 'SINGER CREDIT கடன் ஒப்பந்தம்' };
  const clauses = {
    en: ['The loan is applied directly to the purchase of SINGER goods; no cash is paid to the customer.', 'Instalments are collected by direct debit on the due dates below.', 'Late payment attracts the late fee and penal interest set out in SINGER policy.'],
    si: ['ණය මුදල SINGER භාණ්ඩ මිලදී ගැනීමට කෙලින්ම යොදවන අතර පාරිභෝගිකයාට මුදල් ගෙවනු නොලැබේ.', 'වාරික පහත දිනවලදී සෘජු හර කිරීමෙන් අය කෙරේ.', 'ප්‍රමාද ගෙවීම් සඳහා SINGER ප්‍රතිපත්තියේ දඩ අදාළ වේ.'],
    ta: ['கடன் தொகை நேரடியாக SINGER பொருட்களுக்கு செலுத்தப்படும்; வாடிக்கையாளருக்கு பணம் வழங்கப்படாது.', 'தவணைகள் கீழ்க்கண்ட தேதிகளில் நேரடிப் பற்று மூலம் வசூலிக்கப்படும்.', 'தாமதக் கட்டணங்கள் SINGER கொள்கைப்படி விதிக்கப்படும்.']
  }[lang || loan.lang];
  const lines = [heads[lang || loan.lang], `Template ${AGREEMENT_TEMPLATE_VERSION}`, '', `${c.name} (NIC ${c.nic}) / ${loan.id}`, '',
    `${L.cashPrice}: ${lkr(loan.cashPrice - loan.saleDiscount)}`, `${L.downPayment}: ${lkr(loan.downPayment)}`, `${L.loanAmount}: ${lkr(loan.principal)}`,
    `${L.charges}: ${lkr(loan.charge + loan.fee)}`, `${L.instalment}: ${lkr(loan.instalment)} × ${loan.tenor} ${L.months}`, `${L.totalRepayable}: ${lkr(loan.total + loan.downPayment)}`, '', ...clauses, '',
    ...loan.schedule.rows.map(r => `${String(r.no).padStart(2, '0')}  ${r.due}  ${lkr(rowBase(r))}`)];
  loan.agreement = { lang: lang || loan.lang, templateVersion: AGREEMENT_TEMPLATE_VERSION, text: lines.join('\n'), sentAt: state.clock, signedAt: null, docRef: null };
  audit(state, 'system', 'agreement.generate', loanId, null, { template: AGREEMENT_TEMPLATE_VERSION, lang: loan.agreement.lang });
  notify(state, 'agreement', loan, loan.lang);
  return loan.agreement;
}

function recordSigned(state, loanId, docRef) {
  const loan = state.loans[loanId];
  if (!loan.agreement) throw new Error('Generate and send the agreement first');
  loan.agreement.signedAt = state.clock;
  loan.agreement.docRef = docRef || 'ESIGN-' + loan.id;
  loan.status = 'signed';
  loan.timeline.push({ status: 'signed', at: state.clock, note: loan.agreement.docRef });
  audit(state, 'esign.webhook', 'agreement.signed', loanId, null, { docRef: loan.agreement.docRef });
  return loan;
}

function orderEvent(state, loanId, event, opts = {}) {
  const loan = state.loans[loanId];
  const p = pol(state);
  loan.order.event = event;
  if (event === 'cancelled') return cancelLoan(state, loanId, 'order cancelled');
  if (event !== p.activationEvent) return loan;
  if (loan.status !== 'signed') throw new Error('No loan proceeds without a signed agreement');
  if (loan.downPayment > 0 && !loan.downPaymentVerified) {
    if (opts.downPaymentReceived === false) throw new Error('Down payment not received/verified');
    loan.downPaymentVerified = true;
  }
  loan.status = 'active';
  loan.activatedAt = state.clock;
  loan.dueDay = parseInt(state.clock.slice(8), 10);
  if (p.dueDay.rule === 'fixed_day') loan.dueDay = opts.dueDay || p.dueDay.allowedDays.find(x => x >= loan.dueDay) || p.dueDay.allowedDays[0];
  generateSchedule(state, loan, state.clock, 'activation');
  loan.timeline.push({ status: 'active', at: state.clock, note: `Order ${loan.order.id} ${event}` });
  state.ifsPostings.push({ at: state.clock, type: 'DISBURSEMENT_TO_SINGER', loan: loan.id, amount: loan.principal, order: loan.order.id });
  audit(state, 'ecommerce.webhook', 'loan.activate', loan.id, null, { status: 'active', proceedsTo: 'SINGER', order: loan.order.id });
  const first = loan.schedule.rows[0];
  notify(state, 'schedule', loan, loan.lang, { n: loan.tenor, amount: lkr(rowBase(first)), due: first.due });
  return loan;
}

function changeDueDate(state, loanId, newDay, approver) {
  const loan = state.loans[loanId];
  const p = pol(state);
  if (!p.dueDay.allowedDays.includes(newDay)) throw new Error('Due date not in permitted list: ' + p.dueDay.allowedDays.join(', '));
  if (loan.dueDateChanged) throw new Error('One-time due-date change already used');
  if (!approver) throw new Error('Approval required');
  const before = clone(loan.schedule.rows.map(r => r.due));
  loan.dueDay = newDay;
  const unpaid = loan.schedule.rows.filter(r => r.due > state.clock && rowOwed(r) > 0);
  loan.scheduleHistory.push({ version: loan.schedule.version, reason: loan.schedule.reason, at: loan.schedule.at, rows: clone(loan.schedule.rows) });
  unpaid.forEach((r, i) => { r.nominal = addMonths(state.clock, i + 1, newDay); r.due = nextBusinessDay(p, r.nominal); });
  loan.schedule.version++; loan.schedule.reason = `due date moved to day ${newDay}`; loan.schedule.at = state.clock;
  loan.dueDateChanged = true;
  audit(state, approver, 'loan.due_date_change', loanId, before, loan.schedule.rows.map(r => r.due));
  return loan;
}

// ---------------------------------------------------------------- payments (LM-23, LM-24)
function allocate(state, loan, amount, asOf) {
  const p = pol(state);
  const allocs = [];
  let rem = r2(amount);
  const rows = loan.schedule.rows;
  const pass = filter => {
    for (const row of rows) {
      if (rem <= 0) break;
      if (!filter(row)) continue;
      for (const comp of p.allocationOrder) {
        const owed = r2(row[comp] - row.paid[comp]);
        if (owed <= 0) continue;
        const pay = Math.min(owed, rem);
        row.paid[comp] = r2(row.paid[comp] + pay);
        rem = r2(rem - pay);
        allocs.push({ no: row.no, comp, amount: pay });
        if (rem <= 0) break;
      }
    }
  };
  pass(r => r.due <= asOf);
  if (rem > 0 && p.overpayment === 'next_instalment') pass(r => r.due > asOf);
  return { allocs, remainder: rem };
}

function postPayment(state, loanId, { amount, channel = 'branch', date, ref }, actor = 'system') {
  const loan = state.loans[loanId];
  if (!['active', 'in_arrears'].includes(loan.status)) throw new Error('Loan is not collectable: ' + loan.status);
  const asOf = date || state.clock;
  accrueLoan(state, loan, asOf);
  const before = { outstanding: loanOutstanding(loan), creditBalance: loan.creditBalance };
  const { allocs, remainder } = allocate(state, loan, amount, asOf);
  if (remainder > 0) loan.creditBalance = r2(loan.creditBalance + remainder);
  const pay = { id: nextId(state, 'pay', 'PAY-'), date: asOf, amount: r2(amount), channel, ref: ref || '', allocations: allocs, toCreditBalance: remainder };
  loan.payments.push(pay);
  refreshStatus(state, loan);
  audit(state, actor, 'payment.post', loanId, before, { outstanding: loanOutstanding(loan), creditBalance: loan.creditBalance, payment: pay.id, amount: pay.amount, channel });
  notify(state, 'receipt', loan, loan.lang, { amount: lkr(amount) });
  if (loan.status === 'active' && loanOutstanding(loan) <= 0.005) closeLoan(state, loan, 'settled', 'Final instalment paid');
  return pay;
}

function reversePayment(state, loanId, payId, approver, reason) {
  const loan = state.loans[loanId];
  const pay = loan.payments.find(x => x.id === payId);
  if (!pay || pay.reversed) throw new Error('Payment not found or already reversed');
  if (!approver) throw new Error('Authorised approval required');
  for (const a of pay.allocations) {
    const row = loan.schedule.rows.find(r => r.no === a.no);
    row.paid[a.comp] = r2(row.paid[a.comp] - a.amount);
  }
  loan.creditBalance = r2(loan.creditBalance - pay.toCreditBalance);
  pay.reversed = { by: approver, at: state.clock, reason };
  if (loan.status === 'settled') { loan.status = 'active'; loan.timeline.push({ status: 'active', at: state.clock, note: 'payment reversed' }); }
  refreshStatus(state, loan);
  audit(state, approver, 'payment.reverse', loanId, { payment: payId, amount: pay.amount }, { reversed: true }, reason);
  return pay;
}

// ---------------------------------------------------------------- accrual, delinquency (LM-13, LM-27)
function dpdOf(loan, asOf) {
  if (!loan.schedule) return 0;
  let worst = 0;
  for (const r of loan.schedule.rows) if (r.due < asOf && rowOwed(r, ['fee', 'charge', 'principal']) > 0.005) worst = Math.max(worst, diffDays(asOf, r.due));
  return worst;
}

function accrueLoan(state, loan, asOf) {
  if (!['active', 'in_arrears'].includes(loan.status)) return;
  const p = pol(state);
  const monthlyRate = p.penalRatePerMonth;
  for (const r of loan.schedule.rows) {
    const graceEnd = addDays(r.due, p.graceDays);
    let t = r.lastAccrual || graceEnd;
    if (asOf <= graceEnd) continue;
    const cap = Math.max(p.lateFee, r2(rowBase(r) * p.penaltyCapPctOfInstalment));
    while (t < asOf) {
      t = addDays(t, 1);
      if (t <= graceEnd) continue;
      const unpaidBase = rowOwed(r, ['fee', 'charge', 'principal']);
      if (unpaidBase <= 0.005) break;
      if (!r.lateFeeCharged) { r.penalty = r2(Math.min(cap, r.penalty + p.lateFee)); r.lateFeeCharged = true; }
      r.penalty = r2(Math.min(cap, r.penalty + unpaidBase * monthlyRate / 30));
    }
    r.lastAccrual = asOf;
  }
}

function refreshStatus(state, loan) {
  if (!['active', 'in_arrears'].includes(loan.status)) return;
  const dpd = dpdOf(loan, state.clock);
  const next = dpd > 0 ? 'in_arrears' : 'active';
  if (next !== loan.status) { loan.status = next; loan.timeline.push({ status: next, at: state.clock }); }
  loan.dpd = dpd;
}

function closeLoan(state, loan, status, note) {
  loan.status = status;
  loan.closedAt = state.clock;
  loan.timeline.push({ status, at: state.clock, note });
  if (status === 'settled') notify(state, 'closure', loan, loan.lang);
  audit(state, 'system', 'loan.' + status, loan.id, null, { note });
}

function waivePenalty(state, loanId, rowNo, amount, approver, reason) {
  if (!approver) throw new Error('Waiver requires approval workflow');
  const loan = state.loans[loanId];
  const row = loan.schedule.rows.find(r => r.no === rowNo);
  const open = r2(row.penalty - row.paid.penalty);
  const w = Math.min(open, amount);
  const before = { penalty: row.penalty };
  row.penalty = r2(row.penalty - w);
  audit(state, approver, 'penalty.waive', loanId, before, { penalty: row.penalty, waived: w }, reason);
  return w;
}

// ---------------------------------------------------------------- early settlement (LM-25)
function settlementQuote(state, loanId) {
  const loan = state.loans[loanId];
  const p = pol(state);
  const asOf = state.clock;
  accrueLoan(state, loan, asOf);
  const rows = loan.schedule.rows;
  const dueRows = rows.filter(r => r.due <= asOf);
  const future = rows.filter(r => r.due > asOf && rowOwed(r) > 0.005);
  const dueAmount = r2(dueRows.reduce((s, r) => s + rowOwed(r), 0));
  const fp = r2(future.reduce((s, r) => s + r.principal - r.paid.principal, 0));
  const fc = r2(future.reduce((s, r) => s + r.charge - r.paid.charge, 0));
  const ff = r2(future.reduce((s, r) => s + r.fee - r.paid.fee, 0));
  const k = future.length, n = loan.tenor;
  const rebate = p.settlement.method === 'rule78' ? Math.min(fc, r2(loan.charge * (k * (k + 1)) / (n * (n + 1)))) : fc;
  const discount = k > 0 ? r2(fp * p.settlement.discountPct) : 0;
  const amount = r2(Math.max(0, dueAmount + fp + ff + (fc - rebate) - discount - loan.creditBalance));
  const q = { id: nextId(state, 'quote', 'SQ-'), loan: loanId, createdAt: asOf, validUntil: addDays(asOf, p.settlement.validityDays), method: p.settlement.method,
    breakdown: { overdueAndDue: dueAmount, remainingPrincipal: fp, remainingFees: ff, remainingCharges: fc, unearnedChargeRebate: rebate, settlementDiscount: discount, creditBalance: loan.creditBalance }, amount };
  loan.settlementQuotes.push(q);
  audit(state, 'system', 'settlement.quote', loanId, null, q);
  notify(state, 'settlement', loan, loan.lang, { amount: lkr(amount), due: q.validUntil });
  return q;
}

function settleLoan(state, loanId, quoteId, channel = 'branch') {
  const loan = state.loans[loanId];
  const q = loan.settlementQuotes.find(x => x.id === quoteId);
  if (!q) throw new Error('Settlement quote not found');
  if (state.clock > q.validUntil) throw new Error('Settlement quote expired on ' + q.validUntil);
  const pay = { id: nextId(state, 'pay', 'PAY-'), date: state.clock, amount: q.amount, channel, allocations: [], toCreditBalance: 0, settlement: q.id };
  loan.payments.push(pay);
  for (const r of loan.schedule.rows) for (const k of COMPS) r.paid[k] = r[k];
  loan.rebate = { amount: q.breakdown.unearnedChargeRebate, discount: q.breakdown.settlementDiscount };
  if (q.breakdown.settlementDiscount > 0) state.ifsPostings.push({ at: state.clock, type: 'SETTLEMENT_DISCOUNT', loan: loanId, amount: q.breakdown.settlementDiscount });
  loan.creditBalance = 0;
  closeLoan(state, loan, 'settled', `Early settlement ${q.id}`);
  audit(state, 'system', 'settlement.complete', loanId, null, { quote: q.id, paid: q.amount, rebate: q.breakdown.unearnedChargeRebate });
  return loan;
}

// Shared by partial settlement and goods return: reduce future principal and its charge proportionally.
function applyCredit(state, loan, amount, kind) {
  const asOf = state.clock;
  accrueLoan(state, loan, asOf);
  let rem = amount;
  const dueRows = loan.schedule.rows.filter(r => r.due <= asOf);
  const p = pol(state);
  const allocs = [];
  for (const row of dueRows) for (const comp of p.allocationOrder) {
    const owed = r2(row[comp] - row.paid[comp]);
    if (owed <= 0 || rem <= 0) continue;
    const pay = Math.min(owed, rem);
    row.paid[comp] = r2(row.paid[comp] + pay); rem = r2(rem - pay); allocs.push({ no: row.no, comp, amount: pay });
  }
  const future = loan.schedule.rows.filter(r => r.due > asOf && rowOwed(r) > 0.005);
  const fp = r2(future.reduce((s, r) => s + r.principal - r.paid.principal, 0));
  loan.scheduleHistory.push({ version: loan.schedule.version, reason: loan.schedule.reason, at: loan.schedule.at, rows: clone(loan.schedule.rows) });
  let refund = 0, chargeReduced = 0;
  if (rem >= fp && fp >= 0) {
    refund = r2(rem - fp);
    for (const r of future) { chargeReduced += r.charge - r.paid.charge; for (const k of ['principal', 'charge', 'fee']) r[k] = r.paid[k]; }
    rem = 0;
  } else if (fp > 0) {
    const f = (fp - rem) / fp;
    for (const r of future) {
      const up = r.principal - r.paid.principal, uc = r.charge - r.paid.charge;
      r.principal = r2(r.paid.principal + up * f);
      const newC = r2(r.paid.charge + uc * f);
      chargeReduced += r.charge - newC; r.charge = newC;
    }
  }
  loan.schedule.version++; loan.schedule.reason = kind; loan.schedule.at = state.clock;
  return { allocs, refund, chargeReduced: r2(chargeReduced), futurePrincipalBefore: fp };
}

function partialSettle(state, loanId, amount, channel = 'branch') {
  const loan = state.loans[loanId];
  const before = { outstanding: loanOutstanding(loan) };
  const res = applyCredit(state, loan, amount, 'partial settlement');
  loan.payments.push({ id: nextId(state, 'pay', 'PAY-'), date: state.clock, amount, channel, allocations: res.allocs, toCreditBalance: 0, partialSettlement: true, rebate: res.chargeReduced });
  refreshStatus(state, loan);
  audit(state, 'system', 'settlement.partial', loanId, before, { outstanding: loanOutstanding(loan), chargeRebated: res.chargeReduced });
  if (loanOutstanding(loan) <= 0.005) closeLoan(state, loan, 'settled', 'Partial settlement cleared the loan');
  return { loan, ...res };
}

// ---------------------------------------------------------------- cancellation / returns (LM-26)
function cancelLoan(state, loanId, reason) {
  const loan = state.loans[loanId];
  if (!['approved', 'signed'].includes(loan.status)) throw new Error('Only pre-activation loans can be cancelled; use return for active loans');
  closeLoan(state, loan, 'cancelled', reason);
  const app = state.applications[loan.appId];
  if (app) app.status = 'cancelled';
  return loan; // exposure reservation released because exposure() ignores cancelled loans
}

function returnGoods(state, loanId, returnValue, approver, reason) {
  if (!approver) throw new Error('Return requires approval');
  const loan = state.loans[loanId];
  if (!['active', 'in_arrears'].includes(loan.status)) throw new Error('Loan is not active');
  const before = { outstanding: loanOutstanding(loan), instalment: rowBase(loan.schedule.rows.find(r => r.due > state.clock) || loan.schedule.rows[0]) };
  const res = applyCredit(state, loan, returnValue, 'goods return');
  loan.payments.push({ id: nextId(state, 'pay', 'PAY-'), date: state.clock, amount: returnValue, channel: 'return_credit', allocations: res.allocs, toCreditBalance: 0, refund: res.refund });
  refreshStatus(state, loan);
  const next = loan.schedule.rows.find(r => r.due > state.clock && rowOwed(r) > 0.005);
  audit(state, approver, 'loan.return', loanId, before, { outstanding: loanOutstanding(loan), revisedInstalment: next ? rowBase(next) : 0, refundDue: res.refund, limitRestoredBy: before.outstanding - loanOutstanding(loan) }, reason);
  if (loanOutstanding(loan) <= 0.005) closeLoan(state, loan, 'settled', 'Closed after return');
  return { loan, refund: res.refund, revisedInstalment: next ? rowBase(next) : 0, chargeRebated: res.chargeReduced };
}

// ---------------------------------------------------------------- collections (LM-27, LM-28)
function bucketOf(p, dpd) {
  const b = p.arrearsBuckets.find(([a, z]) => dpd >= a && dpd <= z);
  return b ? (b[1] >= 9999 ? `${b[0]}+` : `${b[0]}-${b[1]}`) : 'Current';
}

function collectionQueue(state) {
  const p = pol(state);
  const rows = [];
  for (const l of Object.values(state.loans)) {
    if (l.status !== 'in_arrears') continue;
    const dpd = dpdOf(l, state.clock);
    const overdue = r2(l.schedule.rows.filter(r => r.due < state.clock).reduce((s, r) => s + rowOwed(r), 0));
    rows.push({ loan: l.id, nic: l.nic, name: state.customers[l.nic].name, phone: state.customers[l.nic].phone, dpd, bucket: bucketOf(p, dpd), overdue, outstanding: loanOutstanding(l), ptp: l.ptp.filter(x => !x.kept).slice(-1)[0] || null, lastContact: l.contacts.slice(-1)[0] || null });
  }
  return rows.sort((a, b) => b.dpd - a.dpd);
}

function recordContact(state, loanId, { outcome, note, user }) {
  const loan = state.loans[loanId];
  loan.contacts.push({ at: state.clock, user, outcome, note });
  audit(state, user, 'collection.contact', loanId, null, { outcome, note });
}

function recordPTP(state, loanId, { date, amount, user }) {
  const loan = state.loans[loanId];
  loan.ptp.push({ at: state.clock, promiseDate: date, amount, user, kept: false });
  audit(state, user, 'collection.ptp', loanId, null, { date, amount });
}

function restructure(state, loanId, extraMonths, approver, reason) {
  if (!approver) throw new Error('Restructuring requires approval');
  const loan = state.loans[loanId];
  const p = pol(state);
  const open = loan.schedule.rows.filter(r => rowOwed(r, ['fee', 'charge', 'principal']) > 0.005);
  const keep = loan.schedule.rows.filter(r => r.due <= state.clock);
  const future = loan.schedule.rows.filter(r => r.due > state.clock && rowOwed(r) > 0.005);
  const before = { instalmentsLeft: open.length, outstanding: loanOutstanding(loan) };
  loan.scheduleHistory.push({ version: loan.schedule.version, reason: loan.schedule.reason, at: loan.schedule.at, rows: clone(loan.schedule.rows) });
  const sum = k => r2(future.reduce((s, r) => s + r[k] - r.paid[k], 0));
  const P = sum('principal'), C = sum('charge'), F = sum('fee');
  const count = future.length + extraMonths;
  const rows = keep.slice();
  let ap = 0, ac = 0, af = 0;
  const lastKept = keep.length;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const principal = last ? r2(P - ap) : r2(P / count), charge = last ? r2(C - ac) : r2(C / count), fee = last ? r2(F - af) : r2(F / count);
    ap += principal; ac += charge; af += fee;
    const nominal = addMonths(state.clock, i + 1, loan.dueDay);
    rows.push({ no: lastKept + i + 1, nominal, due: nextBusinessDay(p, nominal), principal, charge, fee, penalty: 0, paid: { penalty: 0, fee: 0, charge: 0, principal: 0 }, lateFeeCharged: false, lastAccrual: null });
  }
  loan.schedule.rows = rows; loan.tenor = rows.length;
  loan.schedule.version++; loan.schedule.reason = `restructured +${extraMonths} months`; loan.schedule.at = state.clock;
  refreshStatus(state, loan);
  audit(state, approver, 'loan.restructure', loanId, before, { instalmentsLeft: count, outstanding: loanOutstanding(loan) }, reason);
  return loan;
}

function writeOff(state, loanId, approver, reason) {
  if (!approver) throw new Error('Write-off requires approval');
  const loan = state.loans[loanId];
  const amount = loanOutstanding(loan);
  loan.writeOffAmount = amount;
  closeLoan(state, loan, 'written_off', reason);
  state.customers[loan.nic].blocked = true;
  audit(state, approver, 'loan.write_off', loanId, { outstanding: amount }, { status: 'written_off' }, reason);
  return loan;
}

// ---------------------------------------------------------------- daily batch / direct debit simulation (LM-23)
function advanceDays(state, days) {
  const p = pol(state);
  for (let i = 0; i < days; i++) {
    state.clock = addDays(state.clock, 1);
    for (const loan of Object.values(state.loans)) {
      if (!['active', 'in_arrears'].includes(loan.status)) continue;
      const c = state.customers[loan.nic];
      // pre-debit reminder
      for (const r of loan.schedule.rows) {
        if (rowOwed(r) > 0.005 && addDays(state.clock, p.directDebit.reminderDaysBefore) === r.due) notify(state, 'pre_debit', loan, loan.lang, { amount: lkr(rowOwed(r)), due: r.due });
      }
      accrueLoan(state, loan, state.clock);
      // direct-debit attempts on due date and configured retry offsets
      const dueRows = loan.schedule.rows.filter(r => rowOwed(r, ['fee', 'charge', 'principal']) > 0.005 && p.directDebit.retryOffsets.some(o => addDays(r.due, o) === state.clock));
      for (const r of dueRows) {
        const amt = rowOwed(r);
        loan.ddLog = loan.ddLog || [];
        if (c.sim.autoPay && c.bank.mandate === 'active') {
          loan.ddLog.push({ at: state.clock, row: r.no, amount: amt, result: 'success' });
          postPayment(state, loan.id, { amount: amt, channel: 'direct_debit' }, 'direct.debit');
        } else loan.ddLog.push({ at: state.clock, row: r.no, amount: amt, result: 'failed' });
      }
      if (loan.creditBalance > 0) {
        const open = loan.schedule.rows.filter(r => r.due <= state.clock && rowOwed(r) > 0.005);
        if (open.length) { const use = loan.creditBalance; loan.creditBalance = 0; const { remainder } = allocate(state, loan, use, state.clock); loan.creditBalance = remainder; }
      }
      const was = loan.status;
      refreshStatus(state, loan);
      if (loan.status === 'in_arrears') {
        const dpd = dpdOf(loan, state.clock);
        if (was === 'active') notify(state, 'missed', loan, loan.lang, { days: dpd, amount: lkr(r2(loan.schedule.rows.filter(r => r.due < state.clock).reduce((s, r) => s + rowOwed(r), 0))) });
        if (dpd >= p.freezeDpd && c.limitStatus === 'active') { setLimit(state, loan.nic, 'freeze', 'auto.freeze'); }
        for (const t of loan.ptp) if (!t.kept && state.clock > t.promiseDate) t.kept = loan.payments.some(x => x.date >= t.at && x.date <= t.promiseDate) ? true : 'broken';
      }
      if (loan.status === 'active' && c.limitStatus === 'frozen' && !Object.values(state.loans).some(l => l.nic === c.nic && l.status === 'in_arrears')) setLimit(state, c.nic, 'reactivate', 'auto.reactivate');
    }
  }
  return state.clock;
}

// ---------------------------------------------------------------- policy admin (LM-35, LM-N08)
function updatePolicy(state, patch, effective, actor) {
  const current = clone(pol(state));
  const next = Object.assign(current, patch);
  const errors = validatePolicy(next);
  if (errors.length) throw new Error(errors.join('; '));
  state.policy.versions = state.policy.versions.filter(v => v.effective !== effective);
  state.policy.versions.push({ effective, data: next });
  audit(state, actor, 'policy.update', 'policy@' + effective, null, patch);
  return next;
}

// ---------------------------------------------------------------- reporting (LM-33)
function reports(state) {
  const p = pol(state);
  const apps = Object.values(state.applications);
  const byTier = {};
  for (const a of apps) {
    const t = (a.explain && a.explain.tier) || 'n/a';
    byTier[t] = byTier[t] || { approved: 0, declined: 0, referred: 0 };
    const k = ['approved', 'cancelled'].includes(a.status) ? 'approved' : a.status === 'declined' ? 'declined' : 'referred';
    byTier[t][k]++;
  }
  const ageing = { Current: 0 };
  for (const [a, z] of p.arrearsBuckets) ageing[z >= 9999 ? `${a}+` : `${a}-${z}`] = 0;
  let disbursed = 0, outstanding = 0, discounts = 0;
  for (const l of Object.values(state.loans)) {
    if (l.activatedAt) disbursed += l.principal;
    const o = loanOutstanding(l);
    outstanding += o;
    if (['active', 'in_arrears'].includes(l.status)) ageing[bucketOf(p, dpdOf(l, state.clock))] += o;
  }
  for (const x of state.ifsPostings) if (x.type.endsWith('DISCOUNT')) discounts += x.amount;
  const exposures = Object.values(state.customers).filter(c => c.limitStatus !== 'unassessed').map(c => ({ nic: c.nic, name: c.name, tier: c.tier, ...exposure(state, c.nic), limitStatus: c.limitStatus }));
  const hp = exposures.reduce((s, e) => s + e.hp, 0), credit = exposures.reduce((s, e) => s + e.credit, 0);
  return { byTier, ageing, disbursed: r2(disbursed), outstanding: r2(outstanding), discounts: r2(discounts), exposures, hpVsCredit: { hp: r2(hp), credit: r2(credit) },
    counts: { loans: Object.keys(state.loans).length, active: Object.values(state.loans).filter(l => l.status === 'active').length, arrears: Object.values(state.loans).filter(l => l.status === 'in_arrears').length, referred: apps.filter(a => a.status === 'referred').length } };
}

module.exports = {
  newState, pol, registerCustomer, scoreCustomer, assessLimit, setLimit, exposure, eligibility, quote, priceOption, generateSchedule,
  createApplication, manualDecision, generateAgreement, recordSigned, orderEvent, changeDueDate, postPayment, reversePayment,
  accrueLoan, dpdOf, waivePenalty, settlementQuote, settleLoan, partialSettle, cancelLoan, returnGoods, collectionQueue, recordContact,
  recordPTP, restructure, writeOff, advanceDays, updatePolicy, reports, loanOutstanding, rowOwed, rowBase, refreshStatus, bucketOf, audit, notify
};
