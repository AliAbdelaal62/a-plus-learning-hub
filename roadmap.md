# A+ Hub experimental preview roadmap

- [x] Vendor original source (commit 86e86d7) into the project, read-only reference
- [x] Browser runtime: original server + modules running in-page (SQLite WASM, in-memory files saved in browser storage)
- [x] Original interface served unchanged (index.html, team login, vendor libs)
- [x] Synthetic data + synthetic team accounts for each role
- [x] Compare financial outputs with original (12 report endpoints identical to native original on same synthetic data; 22 original server test suites pass under the preview runtime)
- [x] Browser-test sign-in, Arabic/RTL, dark mode, add student + reload persistence, role menus (admin/teacher/accountant)
- [ ] Original browser (Playwright) test suites not yet run against the preview runtime
- [ ] Remaining UI workflows not yet clicked through individually (payments, batch payments, treasury, restore, exports/downloads, team management)
- [ ] Add Admin-managed student identity and scoped original-interface portal
- [ ] Add reconciled student KWD financial/service views, original installments and real approvals
- [ ] Add scoped bilingual student/teacher statements and accurately labeled print-to-PDF
- [ ] Add persistent operation-based notifications and released educational workflows
- [ ] Run security/finance/persistence regression tests and browser workflows for enhancements
- [ ] Known limitations: data lives only in this browser; no scheduled background backups/reminders while tab closed; no real server-side security boundary

## Secure staging review (codex/secure-staging-review)
- [x] Encrypted central storage created in the test database; synthetic data provisioned into empty storage only
- [x] Server settings stored as Secrets (stage staging, release not approved, origin = preview)
- [x] Password-only admin sign-in, role limits, save + fresh-browser reload checked through the preview origin (sandbox)
- [x] Build, 86 gateway checks, withdrawal/cash-flow/regression/UI suites pass
- [ ] Not verified through Lovable's signed-in preview proxy itself (test browser cannot sign in to Lovable)
- [ ] Slow: each request takes ~5–7 s and requests are serialized; concurrent tabs can get a temporary "try again"
- [ ] Rolling in-database backups (30) churn within minutes because every request checkpoints; no off-site backup
- [ ] Open from handoff: dependency advisories, CSP unsafe-inline/XSS review, key/MFA recovery, load/size tests
