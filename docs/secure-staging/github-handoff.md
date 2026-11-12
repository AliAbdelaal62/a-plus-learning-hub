# Secure staging update on the original repository

Date: 2026-11-12

Repository: AliAbdelaal62/a-plus-learning-hub

Branch: codex/secure-staging-review, based on main at 520f2e3f3f990ae66633998c4c220f404b0032c1.

This is a continuation of the original project on a separate review branch, as requested by the owner. Main is not replaced, no publication is authorized and no real database is included or imported. The source copy came from APlus-Hub-Secure-Staging; its latest login fix and disabled Admin authenticator are included. The separate Lovable remix is earlier integration evidence, not the destination for this branch update.

## Included

- Original financial engine runs on the server; the browser receives the same UI and authorized API responses, not a database/runtime.
- Encrypted central snapshot store and service-role-only RPC review SQL, session/origin/CSRF checks, rate limiting and role boundaries.
- Admin authenticator disabled in both local and cloud entry points. Even previously enrolled accounts do not require an OTP while disabled. Password/session authorization remains enabled; enrollment/verification endpoints are unavailable while disabled.
- Server Buffer compatibility fix: login JavaScript is served as executable bytes rather than serialized Buffer JSON.
- Latest in-course Admin withdrawal/refund workflow and regression tests.
- Packaging supports both .output/ and Lovable dist/ server outputs, and the platform-generated high-entropy server encryption-key format.
- .env is untracked on this branch; new actual server keys belong only in provider Secrets. No history rewriting is performed.

## Validation

Full `bun run build` passed on the prepared branch, including server-only WASM finalization. Gateway tests: 86 passing checks including original financial parity and password-only login with saved MFA enrollment. Other regression results are recorded in the pull request.

## Lovable review boundary

The original Lovable project remains on its current main until this review branch is explicitly selected in its GitHub connection. A GitHub push alone does not establish that the preview has switched branches. Select this branch in the original project's GitHub/branch controls when available, then complete its test-only server configuration and verify the actual preview. Do not merge to main or publish as a workaround for branch selection.

The original project's secure-state backend has not been provisioned by this upload. Missing configuration fails closed instead of returning the old browser-only app. Real cloud restore stays locked (423), APLUS_RELEASE_APPROVED stays false, and production remains blocked. The existing secure SQL/configuration in a separate remix must not be mistaken for configuration of the original project. Schema setup must go through Lovable's database workflow.

Still open: original-project cloud integration/provisioning and full workflow review; dependency advisory fixes; legacy unsafe-inline CSP/XSS review; off-site encrypted backup/restore, key/MFA recovery and load/size testing. No production readiness certification is claimed.
