# Local course withdrawal and refund review

Status: local, uncommitted review only. Not pushed to GitHub or published to Lovable. Port 3000 is untouched.

## User workflow
Recorded Courses > open course > student row > Withdrawal and refund.
Only Admin sees the action and can execute it. Admin completes the whole transaction without Coordinator or Accountant approval. The standalone withdrawals menu and old write endpoint are removed/disabled.

The form defaults to refunding the net recorded amount paid. A partial refund retains the difference as the final agreed enrollment fee and waives the rest of the original fee, so that the enrollment closes with zero original-currency balance. The preview explicitly displays refund, waived fee, retained fee, course revenue and percentage teacher entitlement before confirmation. The Admin records date, reason, payment method and matching treasury account, then acknowledges the effect.

## Atomic accounting
One SQLite transaction records an immutable-by-application settlement, original refund adjustments referencing dated receipts or the documented undated opening amount, matching treasury debits, cancelled agreement/registration, audit and notifications. Original installments stay in history with cancelled status. An unfunded/wrong-currency/closed treasury account, stale quote, excess refund or any failure rolls everything back. Idempotency keys and enrollment uniqueness prevent repeated payouts.

Historical enrollment price, cumulative paid amount, original receipts, course selling price, manual declared count and existing teacher payments are never overwritten. An additive credit-note table supplies effective read projections; a dated fee cancellation appears in the student statement. Course revenue deducts waived fees from its existing manual-count basis; instructor percentage is applied to that revised revenue. Existing teacher payouts are retained; any credit remains visible. Cross-currency teacher allocations above the revised entitlement must be reconciled first.

Opening-paid refunds reference the original enrollment without inventing a payment date. Refunds are dated at the actual selected payout date. Dated receipts keep their saved conversion basis. Full backups include settlement tables and restore their accounting projection. Ordinary saves cannot alter settled charges, protected receipts, refund rows or the revenue adjustment.

## Adapters and compatibility
Original reference files in original/ are unchanged. Explicit build/runtime adapters connect state projections, finance.rcc, shared ledger validation of opening balance references, net collection reporting, the native course UI refresh, and cancelled-agreement balances. Projection-only metadata is excluded from ordinary row serialization. Without settlements, original calculations are identical.

Browser preview remains browser-local with the existing preview access limitations. Previously downloaded external content cannot be recalled. No real payment provider is called. This is a recorded cash refund in test bookkeeping.

## Boundaries
This review supports course-currency receipts and undated opening paid amounts, including explicitly attributed payments belonging entirely to that enrollment. Shared allocations, credit/retained transfers, missing saved rates or a fixed legacy instructor fee require prior reconciliation; the form explains the blocker and does not guess. Partial cross-rate retention can expose the existing accounting-currency conversion difference; no current exchange rate or hidden FX settlement is invented.

## Verification
- Settlement regression: 98 checks, including full refund of fully/partly paid courses, partial refund, unpaid cancellation, dated + opening receipts, role restrictions, unchanged source amounts, no new collectible balance, course collections/profit, cancelled installments, transaction rollback, stale quote/idempotency, restart/full export and tamper protection.
- Contextual UI tests: 26 checks, five roles and two languages, default/partial preview, confirmation payload, success, refresh and duplicate-submit prevention.
- Shared presentation: 227 checks. Existing preview: 71 checks, rescheduling: 55, timezones: 40. Vitest: 2 files / 3 tests. Runtime and production builds pass.
- Original regression: 13 suites pass, 2 partial/browser-skipped because Playwright is unavailable, 0 failures.
- Actual browser inspection confirmed the in-course Admin action, Arabic form, partial-payment preview and no-account guidance. The final browser payout was not executed: the in-app browser lost its usable viewport during an independent-origin login test. Automated real-runtime transaction and UI tests cover the payout path. No imported user records were modified.
