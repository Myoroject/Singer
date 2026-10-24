'use strict';
// Date and money helpers. Dates are ISO strings (YYYY-MM-DD) handled in UTC.
const DAY = 86400000;
const pad = n => String(n).padStart(2, '0');
const d = s => new Date(s + 'T00:00:00Z');
const iso = dt => dt.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(d(s).getTime() + n * DAY));
const diffDays = (a, b) => Math.round((d(a) - d(b)) / DAY);
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

function addMonths(s, n, day) {
  const dt = d(s);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + n;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(day || dt.getUTCDate(), dim))));
}

// Sri Lankan NIC: old 9 digits + V/X (YYDDD), new 12 digits (YYYYDDD). DDD > 500 means female.
function parseNic(raw) {
  const nic = String(raw || '').trim().toUpperCase();
  let year, days;
  if (/^\d{9}[VX]$/.test(nic)) { year = 1900 + Number(nic.slice(0, 2)); days = Number(nic.slice(2, 5)); }
  else if (/^\d{12}$/.test(nic)) { year = Number(nic.slice(0, 4)); days = Number(nic.slice(4, 7)); }
  else return null;
  let gender = 'M';
  if (days > 500) { gender = 'F'; days -= 500; }
  if (days < 1 || days > 366) return null;
  const md = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // NIC numbering always treats Feb as 29 days
  let m = 0;
  while (days > md[m]) { days -= md[m]; m++; }
  return { nic, dob: `${year}-${pad(m + 1)}-${pad(days)}`, gender };
}

function ageOn(dob, asOf) {
  const a = d(dob), b = d(asOf);
  let age = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) age--;
  return age;
}

module.exports = { DAY, pad, d, iso, addDays, addMonths, diffDays, r2, parseNic, ageOn };
