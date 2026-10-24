'use strict';
// Demo data. All people are fictional; NICs are synthetic.
const E = require('./engine');

const DEMO_TODAY = '2026-10-24';

function createLoanFlow(state, input, { sign = true, deliver = true } = {}) {
  const { app, loan } = E.createApplication(state, input);
  if (!loan) return { app, loan: null };
  if (sign) { E.generateAgreement(state, loan.id); E.recordSigned(state, loan.id); }
  if (sign && deliver) E.orderEvent(state, loan.id, 'delivered');
  return { app, loan };
}

function seed() {
  const state = E.newState('2026-07-01');
  state.promos = [
    { code: 'ZERO6', name: '0% service charge, 6 months', from: '2026-01-01', to: '2026-12-31', products: ['Electronics', 'Home Appliances'], tenors: [6], annualFlatOverride: 0, feeWaived: true },
    { code: 'FEST5', name: 'Festive 5% sale discount', from: '2026-01-01', to: '2026-12-31', products: ['Home Appliances', 'Furniture'], saleDiscountPct: 0.05 }
  ];
  const people = [
    { nic: '856234567V', name: 'Nimali Perera', phone: '0771234501', lang: 'en', ifs: { onTimePayments: 14, latePayments: 1, purchases: 6, hpOutstanding: 25000 }, docs: { monthlyIncome: 180000, monthlyObligations: 20000, salaryMonthsRegular: 6, tamperRisk: 5 } },
    { nic: '921456789V', name: 'Kasun Silva', phone: '0712345602', lang: 'si', ifs: { onTimePayments: 9, latePayments: 2, purchases: 3, hpOutstanding: 0 }, docs: { monthlyIncome: 90000, monthlyObligations: 32000, salaryMonthsRegular: 5, tamperRisk: 12 } },
    { nic: '883127123V', name: 'Tharindu Fernando', phone: '0753456703', lang: 'en', sim: { autoPay: false }, ifs: { onTimePayments: 12, latePayments: 1, purchases: 4, hpOutstanding: 0 }, docs: { monthlyIncome: 140000, monthlyObligations: 25000, salaryMonthsRegular: 6, tamperRisk: 8 } },
    { nic: '945678234V', name: 'Madhavi Jayasinghe', phone: '0764567804', lang: 'ta', sim: { autoPay: false }, ifs: { onTimePayments: 10, latePayments: 1, purchases: 3, hpOutstanding: 0 }, docs: { monthlyIncome: 120000, monthlyObligations: 28000, salaryMonthsRegular: 6, tamperRisk: 10 } },
    { nic: '199012345678', name: 'Dilani Rajapaksha', phone: '0705678905', lang: 'si', ifs: { onTimePayments: 4, latePayments: 2, purchases: 1, hpOutstanding: 12000 }, docs: { monthlyIncome: 65000, monthlyObligations: 22000, salaryMonthsRegular: 4, tamperRisk: 15 } },
    { nic: '875678901V', name: 'Ruwan Wickramasinghe', phone: '0716789006', lang: 'en', ifs: { onTimePayments: 2, latePayments: 5, purchases: 1, hpOutstanding: 40000 }, docs: { monthlyIncome: 38000, monthlyObligations: 24000, salaryMonthsRegular: 2, tamperRisk: 30 } },
    { nic: '198834567890', name: 'Sampath Kumara', phone: '0727890107', lang: 'en', ifs: { onTimePayments: 8, latePayments: 0, purchases: 3, hpOutstanding: 0 }, docs: { monthlyIncome: 110000, monthlyObligations: 15000, salaryMonthsRegular: 6, tamperRisk: 82 } },
    { nic: '823456780V', name: 'Chamara Gunawardena', phone: '0778901208', lang: 'en', ifs: { onTimePayments: 6, latePayments: 6, purchases: 2, hpOutstanding: 80000, hpDelinquent: true }, docs: { monthlyIncome: 130000, monthlyObligations: 30000, salaryMonthsRegular: 6, tamperRisk: 10 } },
    { nic: '767301234V', name: 'Priyanka Wijesekara', phone: '0719012309', lang: 'en', ifs: { onTimePayments: 11, latePayments: 0, purchases: 5, hpOutstanding: 0 }, docs: { monthlyIncome: 160000, monthlyObligations: 18000, salaryMonthsRegular: 6, tamperRisk: 4 } }
  ];
  for (const p of people) {
    E.registerCustomer(state, { nic: p.nic, name: p.name, phone: p.phone, lang: p.lang, ifs: p.ifs, sim: p.sim, email: p.name.split(' ')[0].toLowerCase() + '@example.lk' }, 'onboarding.api');
    E.assessLimit(state, p.nic, p.docs, 'credit.officer');
  }
  state.demoDocs = Object.fromEntries(people.map(p => [p.nic, p.docs]));

  // Historical activity: build loans in July/August, advance the clock to the demo date.
  createLoanFlow(state, { nic: '856234567V', product: 'Electronics', cashPrice: 220000, downPayment: 20000, tenor: 12, docs: state.demoDocs['856234567V'], orderId: 'ORD-88121' });
  createLoanFlow(state, { nic: '921456789V', product: 'Home Appliances', cashPrice: 95000, downPayment: 10000, tenor: 6, promoCode: 'ZERO6', docs: state.demoDocs['921456789V'], orderId: 'ORD-88140' });
  createLoanFlow(state, { nic: '883127123V', product: 'Furniture', cashPrice: 180000, downPayment: 20000, tenor: 12, docs: state.demoDocs['883127123V'], orderId: 'ORD-88163' });
  E.advanceDays(state, 50); // 2026-08-20
  createLoanFlow(state, { nic: '945678234V', product: 'Electronics', cashPrice: 140000, downPayment: 20000, tenor: 6, docs: state.demoDocs['945678234V'], orderId: 'ORD-88410' });
  E.advanceDays(state, 65); // 2026-10-24
  state.clock = DEMO_TODAY;
  return state;
}

module.exports = { seed, createLoanFlow, DEMO_TODAY };
