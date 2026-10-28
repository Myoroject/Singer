# SINGER CREDIT - Desktop demo (RFP 01)

Electron desktop app demonstrating the SINGER Credit Loan Model & Loan Management Platform described in
`../SINGER Credit Managment - RFP 01 Loan Model & Loan Management Platform.pdf`.

All data is synthetic. The app was written from the RFP; it is not a copy of any vendor product.

## Run

```bash
npm install
npm start          # launches the desktop app (seeded demo data, persisted in the user data folder)
npm test           # engine tests (node:test)
```

Use "Reset demo data" in the top bar to return to the seed data, and "+1 / +7 / +30 days" to
simulate time passing (direct-debit attempts, penalty accrual, arrears, limit freeze, reminders).

## What it covers (RFP reference)

| Area | Screen | RFP |
|---|---|---|
| Customer record per NIC, e-KYC / bank / HP checks, HP protection | New application | LM-01, 02 |
| Document scorecard, risk tier, explainability record | New application / decision | LM-03, 04, 34 |
| Tenor / down payment / flat charge / fees / rounding, 3-language plan options | New application | LM-06..10 |
| Schedule with version history, due-date rules, holidays, one-time change | Loan detail | LM-11, 12 |
| Grace, late fee, penal interest with caps, waiver with approval | Loan detail | LM-13 |
| Promo codes and sale-stage discounts posted to IFS | New application / Audit | LM-14 |
| Credit limit lifecycle, total exposure (HP + CREDIT + reserved), hard block, guarantor | Customers | LM-15..17 |
| Auto-approve / refer / decline, approval authority, underwriter queue with SLA | Underwriter queue | LM-19 |
| Agreement (EN/SI/TA), e-sign callback, disbursement to SINGER on order event | Loan detail | LM-20..22 |
| Direct debit with retries, payment allocation, early / partial settlement, returns, reversals | Loan detail | LM-23..26 |
| DPD buckets, auto limit freeze, PTP, restructure, write-off with approval | Collections | LM-27, 28 |
| Notifications in 3 languages, statements, payment history, lifecycle | Audit / Loan detail | LM-29..32 |
| Reports with CSV export, immutable audit log, versioned policy with caps | Reports / Audit / Policy | LM-33..35 |

## Not in this demo

Real integrations (IFS ERP, e-KYC, Direct Debit, e-signature, SMS/email/push gateways) are simulated inside the app.
Sinhala and Tamil text is draft and must be reviewed by SINGER. Requirement LM-05 (champion/challenger) and the
non-functional/security requirements (uptime, DR, MFA, encryption at rest) are out of scope for this demo.

`demo/singer-credit-demo.mp4` is a screen recording of a scripted walkthrough (recorded before the latest visual refresh).

Staff instructions are in `docs/SOP.md`, also available inside the app under **User guide**. The SINGER wordmark is a text placeholder; swap in the official logo asset before client use.
