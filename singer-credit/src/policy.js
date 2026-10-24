'use strict';
// Versioned, effective-dated policy (RFP LM-35). Edited at runtime without a code release (LM-N08).
const DEFAULT_POLICY = {
  caps: { maxAnnualFlatRate: 0.30, maxProcessingFeePct: 0.03, maxPenalRatePerMonth: 0.03, maxLateFee: 1000 },
  tiers: {
    A: { limit: 600000, annualFlat: 0.12, tenors: [3, 6, 12, 18], minDownPct: 0, autoApproveMax: 300000 },
    B: { limit: 350000, annualFlat: 0.16, tenors: [3, 6, 12], minDownPct: 0.10, autoApproveMax: 150000 },
    C: { limit: 150000, annualFlat: 0.20, tenors: [3, 6], minDownPct: 0.20, autoApproveMax: 0 },
    D: { limit: 0, annualFlat: 0.24, tenors: [], minDownPct: 0.30, autoApproveMax: 0 }
  },
  tierCutoffs: { A: 75, B: 60, C: 45 },
  products: {
    'Home Appliances': { min: 20000, max: 600000 },
    'Electronics': { min: 15000, max: 500000 },
    'Furniture': { min: 25000, max: 400000 },
    'Motor Bikes': { min: 150000, max: 600000 },
    'Agro Products': { min: 30000, max: 500000 }
  },
  // HP protection: segment/category/price-band rules so CREDIT complements HP rather than replacing it.
  hpProtection: [
    { category: 'Motor Bikes', minPrice: 0, requireTier: 'B', note: 'Motor bikes are an HP-led category' },
    { category: '*', minPrice: 350000, requireTier: 'A', note: 'High price band stays on HP unless top tier' }
  ],
  guarantor: { requiredAbove: 400000, requiredForTiers: ['C'], defaultForBnpl: false },
  processingFeePct: 0.01,
  minProcessingFee: 500,
  rounding: 10,
  graceDays: 5,
  lateFee: 500,
  penalRatePerMonth: 0.02,
  penaltyCapPctOfInstalment: 0.25,
  dueDay: { rule: 'purchase_anniversary', allowedDays: [1, 5, 10, 15, 20, 25] },
  holidays: ['01-01', '02-04', '04-13', '04-14', '05-01', '12-25'],
  allocationOrder: ['penalty', 'fee', 'charge', 'principal'],
  overpayment: 'next_instalment', // or 'credit_balance'
  settlement: { method: 'rule78', validityDays: 7, discountPct: 0.01 },
  arrearsBuckets: [[1, 30], [31, 60], [61, 90], [91, 9999]],
  freezeDpd: 30,
  directDebit: { retryOffsets: [0, 2, 4], reminderDaysBefore: 2 },
  activationEvent: 'delivered', // or 'confirmed'
  approvalAuthority: { underwriter: 300000, senior_underwriter: 600000 },
  slaHours: 4
};

function policyAt(state, date) {
  const versions = state.policy.versions.slice().sort((a, b) => a.effective.localeCompare(b.effective));
  let pick = versions[0];
  for (const v of versions) if (v.effective <= date) pick = v;
  return pick.data;
}

function validatePolicy(p) {
  const c = p.caps;
  const errors = [];
  for (const [t, v] of Object.entries(p.tiers)) if (v.annualFlat > c.maxAnnualFlatRate) errors.push(`Tier ${t} rate exceeds system cap`);
  if (p.processingFeePct > c.maxProcessingFeePct) errors.push('Processing fee exceeds system cap');
  if (p.penalRatePerMonth > c.maxPenalRatePerMonth) errors.push('Penal rate exceeds system cap');
  if (p.lateFee > c.maxLateFee) errors.push('Late fee exceeds system cap');
  return errors;
}

module.exports = { DEFAULT_POLICY, policyAt, validatePolicy };
