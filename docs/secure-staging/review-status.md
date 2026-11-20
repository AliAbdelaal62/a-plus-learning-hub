# Review status — 2026-11-10

No publication or real-data transfer is approved. Original port 3000, original project/repository and real data remain untouched.

## Available local review

http://127.0.0.1:3013/ — synthetic data; original UI served through the server gateway. Local review intentionally does not require MFA by default; cloud requires it.

Latest checks: 76 gateway checks passed; 98 course settlement checks passed; 26 contextual withdrawal UI checks passed. The Cloudflare emulator independently passed login, mandatory MFA enrollment/verification, authenticated state and course ledger. API/automated results do not replace a full manual browser walkthrough.

## Lovable staging progress and blocker

Isolated unpublished remix: c1abae1e-998a-48a9-9ee5-fd2c813ff78d.

Lovable reports overlay commit c001fec3d7341a594f63f62b46027416d15007f2, separate database, private encrypted-state tables/RPCs installed, anonymous/authenticated access denied and server configuration stored. It reports 76 gateway and 26 UI checks passing. Platform adaptations handle dist output and a generated high-entropy URL-safe key via domain-separated SHA256 before AES-256-GCM.

Remote work is incomplete: synthetic provisioning has NOT run; actual preview integration and full artifact audit remain unverified; its withdrawals test failed without a diagnostic. The same 98-check suite passes locally. Do not treat the remote preview as ready or finance-verified. Full build must be rerun after its packaging adjustment.

Continuation was attempted twice; Lovable explicitly rejected the request because the workspace has no credits. No subscription or credit purchase was initiated. Remote changes are in the remix, not pushed to the original GitHub repository. Local/remote adaptations are not yet reconciled.

## Dependency audit

Bun lockfile audit found advisories affecting eight dependency package names: @vitest/mocker, brace-expansion, esbuild, launch-editor, minimatch, nanoid, shell-quote and vite. The returned entries include 1 critical, 10 high, 11 moderate and 1 low advisory (overlapping advisories/versions are not independent reachable vulnerabilities). See dependency-audit.json. Reachability and compatible fixes remain to be assessed; no blanket upgrades were applied to the shared dependency tree.

## Release blockers

Cloud integration/provisioning, full workflow/regression review, dependency fixes, XSS/CSP compatibility exception, load/size testing, off-site encrypted backups and recovery/key/MFA procedures remain open. Cloud real-data restore stays locked and APLUS_RELEASE_APPROVED remains false. This is a review build, not a production security certification.
