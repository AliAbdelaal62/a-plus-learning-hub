# A+ Hub Academy

Local academy management application built with Node.js, SQLite and the existing HTML/JavaScript frontend.

Includes teacher and student management, subjects, lessons, projects, recorded courses, scheduling, attendance, follow-up tasks, payments, financial reporting, treasury reconciliation and batch teacher payments. The interface supports Arabic/English, right-to-left layout, and light/dark appearance.

## Requirements

- Node.js 24 LTS recommended (built-in SQLite support required).
- A modern browser.
- No npm dependencies are required for the application itself.

## Run a disposable demo

```powershell
npm run start:synthetic
```

This creates synthetic records under `data/synthetic.sqlite` and listens on `http://localhost:3001/`. It does not use an academy database. The synthetic demo deliberately disables authentication and binds to loopback only; do not expose it to a network.

## Run with your own local database

Real databases, account credentials, backups, financial exports and screenshots are excluded from this repository. This code upload does not migrate or upload academy data.

For the independent review launcher, place your authorized, complete database copy at `data/review.sqlite`, then run:

```powershell
node --no-warnings scripts/start-review.js
```

It uses `http://localhost:3005/`, retains authentication and refuses to create a missing review database. The review server intentionally rejects port 3000 to protect the separate working academy instance. A code checkout is not a database backup or a deployment.

## Frontend build

```powershell
npm run build:public
```

`public/index.html` is generated. Shared presentation sources are in `src/client/redesign.css`, `src/client/redesign-ui.js`, `src/client/preferences-ui.js` and `src/client/ui-translations.json`. Preserve the read-only production reference used by the build.

## Validation

```powershell
npm test
node tests/ui-preservation.test.js
node tests/ui-preferences.test.js
```

The existing test suite uses isolated synthetic databases. Browser suites require Playwright and report a skip, rather than a pass, when it is absent. The additional UI tests verify that the original application is recoverable without presentation changes and that translated option labels retain their original values.

## Data protection

- Keep this repository private unless its owner explicitly decides otherwise.
- Never commit local SQLite files, backups, credentials, actual student/teacher records, or data screenshots.
- UI language and appearance preferences are stored in the browser; financial records remain in SQLite.
- Verify a complete backup and the target database before changing a working installation.

## دليل مختصر

هذه نسخة الكود المطوّر للنظام، وتشمل العربية والإنجليزية والوضع الداكن. قاعدة بيانات الأكاديمية وبيانات الدخول والنسخ الاحتياطية غير مرفوعة. التجربة الوهمية تعمل على 3001، ونسخة المراجعة بقاعدة بياناتك المحلية تعمل على 3005. نسخة الشغل على 3000 مستقلة عن هذا المستودع.
