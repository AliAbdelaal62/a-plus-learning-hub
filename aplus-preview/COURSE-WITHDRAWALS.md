# Recorded-course direct withdrawal

Implemented in the Lovable-compatible browser preview only. Production on port 3000 is untouched.

## Permissions and workflow
- Academy > Course Withdrawals: Admin and Coordinator select an existing student enrollment, date, reason, optional refund-review flag, and confirm the financial warning.
- Accountant can read the list and review the flag, but cannot withdraw students. Student and Teacher cannot access this administrative list or create withdrawals.
- A withdrawal immediately removes course delivery links and released Course shares from that student's portal; it retains the enrollment and shows withdrawal history. New Course shares cannot be published for the withdrawn enrollment. Previously downloaded files/external URLs cannot be recalled.
- Student and assigned Teacher receive in-app notifications. Audit records include actor, enrollment, date and reason. Identical retries do not duplicate events; conflicting replacements are rejected.
- This is additive preview metadata, included in full database transfers and persistence. No original source, original schema version or historical record is changed.

## Money and limits
Withdrawal does not automatically waive a charge, cancel an installment, alter teacher earnings, delete a payment or create a refund. The UI explicitly requires acknowledgment.

The optional flag requests financial review only. It is not approval, an amount, a new payment or proof of payout. Actual full/partial refunds continue through the existing original financial workflow tied to original receipts, with its existing permissions and limits. Fee waivers, installment settlements and teacher entitlement changes remain separate financial decisions; no new formula or automatic settlement was introduced. The enrollment's recorded-paid column is the original cumulative field, not a net-refund calculation.

Student-initiated withdrawal requests and reopening a withdrawn enrollment are not introduced by this change.

## Validation
- Withdrawals regression: 44 checks, including role restrictions, validation, idempotence, notifications, content isolation, snapshot/restart and unchanged original financial tables/statements/installments.
- Presentation regression: 235 checks across five roles and Arabic/English.
- Existing extension regressions: 71 transfer/finance checks, 55 scheduling checks and 40 timezone checks pass.
- Existing Vitest: 2 files / 3 tests pass. Browser runtime and production builds pass.
- Actual browser inspection confirmed the Arabic administrative form and grouped icon navigation on port 3011. No withdrawal or refund was executed against the user's browser data.
- Actual Lovable private preview refresh is not verified in this session; GitHub synchronization is verified separately.
