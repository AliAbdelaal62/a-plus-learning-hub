# Admin database transfer and portal verification

This extends the original-interface browser preview, not the earlier React rebuild.
Local academy production and the original source reference are untouched.

## Where to find it

Sign in as Admin, open **Settings**, then **Data & Backups**.

- **Export full backup** downloads a `.aplus-backup.json` package containing a consistent
  complete SQLite snapshot and a manifest. All user tables, including student identities,
  notifications, installments, approvals, accounting records and password hashes, are included.
- Adjacent application configuration and transfer history are captured as checked sidecars.
  Source-computer backup folder paths are not activated in the browser.
- External attachment files, previous backup files, deployment secrets and browser display
  preferences are excluded explicitly. URLs stored in the database are preserved.
- **Validate & preview** accepts these packages or a consistent legacy `.sqlite` backup.
  State-only JSON and ZIP archives are deliberately unsupported.
- Maximum database size is **16 MiB** in this preview. This is not an unrestricted server
  migration service. Files remain in the local browser; they are not uploaded to AI or GitHub.

Validation checks checksums, every table fingerprint when available, integrity, foreign keys,
schema compatibility, administrator availability, password hashes and student/teacher links.
Current and incoming counts and financial balances by original currency are shown first.
The checksum detects corruption; it is not proof of the sender's authenticity.

Older supported schemas are upgraded on a staging copy only after explicit confirmation.
A legacy backup without an active administrator requires controlled provisioning of one
before activation. Existing account hashes and roles are preserved. No DEV users are seeded
into imported databases. The import adds missing portal structures empty.

Import is replacement, not merge. It rejects stale validation if the destination changed.
It saves and verifies a destination safety backup before switching, pauses writes/scheduling,
then waits for localStorage and IndexedDB persistence before reporting success. On failure it
restores the previous database and attempts to restore both persistence copies. Any failure to
verify rollback storage is reported explicitly; the safety copy remains recoverable.

All sessions are invalidated after success. Sign in again with an account from the imported
database. The safety backup is downloaded and retained in the browser backup directory.

## Portal integration fixes

The student portal, educational sharing, scoped statements, account management, installment
approvals and notifications already existed at upstream commit `585a7c2` and were retained.
This change additionally:

- Enforces KWD-only student installment projections, with incomplete conversion shown when
  no valid historical KWD basis exists. No rate is invented.
- Keeps staff plan editing in the original obligation currency through a separate authorized
  endpoint, rather than treating converted student display amounts as editable native amounts.
- Requires approval for Accountant additions to an existing plan through the original API too.
- Rejects non-HTTPS learning links in the extension display.
- Updates extension navigation/content and transfer labels when language changes.
- Replaces the synthetic-only badge with an accurate local-browser-data notice after import.

## Verification

- 71 extension/runtime regression checks passed, including role denials, cross-account access,
  account preservation, bad backups, stale validation, simulated persistence failure, rollback,
  session invalidation, restart persistence and a synthetic legacy schema-5 upgrade.
- 13 original Node test suites passed. Currency-report and FX-regression suites passed their
  server/unit parts but skipped their Playwright portions (exit 77); those are not full passes.
- Existing Vitest suite: 2 files, 3 tests passed.
- Browser runtime generation and complete production build passed.
- Real browser: Admin login → Settings → full backup download → file selection → validation →
  confirmation → restore/persistence → sign-out → same-account login → safety backup/history
  visible. No captured browser console errors during that workflow.
- Original reference files and financial calculation modules have no source changes.

Run locally with Node 24 and Bun:

```sh
bun aplus-preview/build.ts --node
node --no-warnings aplus-preview/tests/regression.cjs
node aplus-preview/tests/original-regression.cjs
bun aplus-preview/build.ts
bun run test
bun run build
```

## Limits and outstanding verification

This remains browser-local data with no shared server-side authentication boundary or device
synchronization. Importing real records does not turn it into secure multi-user hosting.
Automatic backups/reminders require the tab to remain open. Student/teacher PDF uses the
existing accurately labelled browser Print / Save as PDF flow.

The original Settings original-currency summary rendered some `NaN` cells in the synthetic
browser fixture. That pre-existing presentation/report mismatch was observed separately from
the new transfer panel and was not repaired by changing financial calculations.
Full original Playwright suites and every educational/financial form have not been rerun as
browser journeys in this change. No real production database was used or transferred.
