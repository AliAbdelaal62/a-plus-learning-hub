# A+ Hub experimental preview roadmap

- [x] Vendor original source (commit 86e86d7) into the project, read-only reference
- [x] Browser runtime: original server + modules running in-page (SQLite WASM, in-memory files saved in browser storage)
- [x] Original interface served unchanged (index.html, team login, vendor libs)
- [x] Synthetic data + synthetic team accounts for each role
- [x] Compare financial outputs with original (12 report endpoints identical to native original on same synthetic data; 22 original server test suites pass under the preview runtime)
- [x] Browser-test sign-in, Arabic/RTL, dark mode, add student + reload persistence, role menus (admin/teacher/accountant)
- [ ] Original browser (Playwright) test suites not yet run against the preview runtime
- [ ] Remaining UI workflows not yet clicked through individually (payments, batch payments, treasury, restore, exports/downloads, team management)
- [ ] Known limitations: data lives only in this browser; no scheduled background backups/reminders while tab closed; no real server-side security boundary
