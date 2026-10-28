# SINGER CREDIT: How to use the application

Standard operating procedure for credit, operations, collections and finance staff.

## 1. Who does what

- **Credit officer / underwriter:** reviews referred applications, manages credit limits and policy.
- **Operations:** sends agreements, confirms delivery, posts payments, handles returns and settlements.
- **Collections agent (call center):** works the arrears queue.
- **Finance:** reviews disbursements, reports and the audit log.

## 2. Before you start

- The date shown at the top is today's date. The system runs its daily work (direct-debit attempts, penalties, reminders) automatically for any days the app was closed.
- Use the language switch (EN, සිං, தமிழ்) at the top right to show plan options, agreements and customer messages in English, Sinhala or Tamil.
- All customers, bank links and integrations in this demo are simulated.

## 3. Review the Dashboard

1. Open **Dashboard** at the start of each day.
2. Check **Awaiting underwriter** and **Collections** badges in the left menu. A red number means work is waiting.
3. Read **Arrears ageing** for overdue balances and **Total exposure** for the HP and CREDIT split.

## 4. Create a loan application

Open **New application**. The progress bar at the top shows three steps.

**Step 1: Customer and purchase**
1. Pick the customer.
2. Choose the product category, cash price and down payment. Add a promo code if one applies.
3. Open **Income documents** to check the extracted income, obligations, salary regularity and tamper risk. Open **Guarantor** only if policy requires one.
4. Select **Continue**.

**Step 2: Verification and plan**
1. Read the **Customer verification** list: identity and age, e-KYC, bank account and direct-debit mandate, account standing, credit limit and HP protection. A red cross means the customer will be declined or referred.
2. Compare the plan cards. Each card shows the instalment, cash price, down payment, loan amount, charges and total repayable.
3. Select one plan and choose **Submit application**.

**Step 3: Decision**
- **Approved instantly:** open the loan and continue with section 6.
- **Sent for manual review:** go to the **Underwriter queue** (section 5).
- **Declined:** the reasons are listed. Open **Why this decision?** for the rules and scorecard.

## 5. Underwriter queue

1. Open **Underwriter queue**.
2. Read the loan amount, risk tier and the reason for the referral.
3. Choose your role. An **Underwriter** can approve up to LKR 300,000 and a **Senior underwriter** up to LKR 600,000.
4. Add a note and select **Approve** or **Decline**. Each decision is recorded in the audit log.

## 6. Agreement, signature and delivery

Open the loan (**Loans** > the loan).

1. Status **approved**: select **Send agreement for e-signature**. Review the document in the **Agreement** tab.
2. When the customer signs, the status becomes **signed**. In this demo select **Simulate signed callback**.
3. Status **signed**: the loan waits for the order to be delivered. Select **Simulate order delivered**. The status becomes **active**.
4. No loan can activate without a signed agreement.
5. Use **Print / Save as PDF** on the agreement to give the customer a copy.

## 7. Disbursements

Open **Disbursements**. Proceeds are paid to SINGER against the order, never to the customer.

- **Awaiting signature** and **Pending delivery** show loans not yet released.
- **Released** shows loans whose order event was received, with the disbursement reference and date.
- Use **Release on delivery** on a pending row if the order has been delivered.

## 8. Collect and post payments

1. Open the loan and select **Post payment**. Enter the amount and channel (branch, card, LankaQR or bank transfer).
2. Payments clear penalties first, then fees, charges and principal, oldest due first. An overpayment goes to the next instalment.
3. Direct debits run automatically on due dates, with retries. The **Payments** tab shows each attempt.
4. To correct a wrong posting, open the **Payments** tab and select **Reverse**. It needs approval and is logged.

## 9. Early settlement, partial settlement, returns, due dates

Open the loan and select **More actions**.

- **Settlement quote:** shows the amount to close today, with the unearned charge rebated. The quote is valid for 7 days. Select **Collect and settle** to close the loan.
- **Partial settlement:** pays down principal and rebates the unearned charge on it. The schedule is regenerated.
- **Goods return:** recalculates the schedule on the revised value, restores the credit limit and shows any refund due.
- **Change due date:** one change per loan, with approval.
- **Cancel loan:** only before activation. The reserved credit limit is released.

## 10. Collections

1. Open **Collections**. Cases are listed by days past due and arrears bucket.
2. Select **Log contact** after each call.
3. Select **Promise to pay** to record a date and amount.
4. Select **More** for **Restructure** (extends the remaining schedule, with approval) or **Write off** (with approval, blocks the customer).
5. Contact the customer only. Do not contact third parties.
6. To remove a late penalty, open the loan, then the **Schedule** tab, and select **Waive penalty**. This needs approval.

## 11. Customers and credit limits

- **Customers** shows each customer's limit, tier and exposure (HP, CREDIT and pending orders).
- Freeze a limit with **Freeze**. A limit freezes automatically at 30 days past due and reactivates once the arrears are cleared.

## 12. Policy

1. Open **Policy** to see tier pricing, system caps and HP protection rules.
2. To change grace days, late fee, penal rate or settlement discount, enter the new values and an **Effective from** date, then select **Save new version**.
3. Values above the system caps are rejected. Earlier versions stay on record.

## 13. Reports and audit

- **Reports:** the loan book and customer exposure. Use **Export CSV**; files are saved in Documents > SINGER-Credit-Exports.
- **Audit log:** decisions, payments, configuration changes and user actions with before and after values. The other tabs show customer messages and IFS postings.

## 14. If something looks wrong

- **A button is disabled:** a required step is missing, for example no plan is selected.
- **An action shows a red message:** it explains the rule that blocked it, for example an expired quote or an approval limit.
- **Reset data** (bottom of the left menu) restores the demo data. Use it only in the demo.
