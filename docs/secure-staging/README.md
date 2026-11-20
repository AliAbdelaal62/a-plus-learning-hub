# A+ Hub secure staging — review before publishing

Update 2026-11-12: the owner requested disabling Admin authenticator codes. Both local and cloud source entry points now set requireMfa=false. The gateway hides the OTP field, does not enforce saved MFA enrollments and returns 404 for enrollment/verification while disabled. Password/session authorization, CSRF, rate limits and storage protection remain. The isolated Lovable copy is not synced with this local change yet; previous MFA-required descriptions below describe the earlier implementation.

This is an isolated review copy. Original port 3000, the original GitHub main, original Lovable project and real databases are untouched. No production release is approved.

## Architecture
The same original SQLite financial engine and the approved local extensions run on the server. The browser receives the original HTML/CSS, role-filtered data and a small HTTP transport, never a SQLite engine, database file, server credentials or a full snapshot.

For compatibility and financial parity, the cloud provider persists an AES-256-GCM encrypted SQLite filesystem snapshot in a private PostgreSQL schema. Server-only service-role RPCs acquire a lease and checkpoint with version checks. This is not a per-table PostgreSQL rewrite. It intentionally preserves existing calculations first; whole-snapshot size, per-request initialization and serialized throughput require load tests before production. Client RLS access to this storage is denied entirely, while the original API enforces role/ownership rules on the server.

## Tested locally
- Same original login/screens, Arabic/English, themes, all original API routes and current extensions.
- Original financial report parity on identical synthetic fixtures.
- Central server sessions, HTTPS Secure/HttpOnly/SameSite cookies, origin and CSRF checks.
- Administrator TOTP setup/login enforcement; verified-session binding; seeds are outside downloadable DB backups.
- Durable failed-login limits/audit, encrypted local persistence, failed storage => no fake success.
- Serialized concurrent changes, stale REV rejection, full transfer validation persisted across separate invocations, safety checkpoint before restore, revoked restored sessions.
- Cloudflare emulator runs the server-only WASM engine, login, MFA and the financial ledger.

## Local review
Run `bun run secure:review`. It uses port 3013 and `.secure-data`, not any production path. Synthetic credentials are documented only for this local test: dev.admin / DevPreview-2026!. The default local review does not require MFA so the owner can first inspect UI/workflows. Set APLUS_TEST_MFA=1 to rehearse mandatory Admin enrollment; actual cloud configuration always requires Admin MFA.

`node secure-server/tests.mjs` verifies the server gateway. `bun run build` emits a Cloudflare-compatible server engine/WASM, removes browser DB assets and applies fail-closed server routing. Source files in original/ are untouched.

## Cloud test activation
Use only the remixed, unpublished project `c1abae1e-998a-48a9-9ee5-fd2c813ff78d`. It has its own Lovable database, distinct from the original project.
1. Ask Lovable to apply `central-state.review.sql` to that TEST database. No original application tables need replacement.
2. Configure server-only encryption/CSRF keys and instance/origin. Never expose a service role or private key via VITE_ or a source file. Set APLUS_DEPLOYMENT_STAGE=staging, APLUS_RELEASE_APPROVED=false.
3. Operator-only synthetic provisioning requires APLUS_SYNTHETIC_PROVISION=YES and refuses existing state. No real import is permitted.
4. Test the actual preview's state persistence, role boundaries and gateway RPC permissions; verify anonymous/authenticated Postgres roles cannot execute snapshot RPCs or read private tables.
5. Match financial outputs to local baseline and test independent browsers/concurrent writes and rollback, not only visual similarity.

## Release blockers
Production and real migration remain unapproved. Real-data restore returns 423 in cloud mode. Staging APP_ORIGIN is pinned to the exact preview origin, so a different published hostname cannot silently use it. APLUS_RELEASE_APPROVED must never be enabled without explicit user review.

Still required before real launch: actual Lovable build/runtime integration evidence, external encrypted/off-site backup and restore rehearsal, key recovery/rotation, protected MFA recovery procedure, performance/size tests, dependency advisory fixes verified with the installed lockfile, and XSS review. The legacy UI needs inline scripts/handlers, so CSP currently retains unsafe-inline; this is a documented compatibility exception rather than a claim of perfect XSS protection. The prior simplified React rebuild is not used as the academy app.

No promise of zero security risk or completed production certification is made by these checks.
