<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Staff access is role-based via `user_roles` + security-definer helpers (`is_staff`, `can_edit`, `my_teacher_id`); admin/coordinator write, teacher-only accounts see just their own lessons/schedule — keeps permissions enforced in the database, not the UI.
- Simple record pages use the shared `CrudPage` field config (`src/components/crud-page.tsx`) — one place for list/search/edit behavior.
- All UI text goes through `src/lib/i18n.tsx` (`t(key)`); the document `dir` follows the language — the app is bilingual.

## Project rules (experimental preview)
- `/` forwards to `/aplus/index.html`, which runs the original app's server code in the browser (`aplus-preview/`, built by `bun aplus-preview/build.ts` into `public/aplus/`); original sources in `aplus-preview/original/` are never edited — adaptations happen at build time or in shims, so parity with the original is preserved.
- Preview data is saved compressed to localStorage synchronously on every write (plus IndexedDB), because the original pages navigate immediately after writes and async saves were lost.
- The earlier simplified rebuild (`src/routes/_authenticated/*`) is kept but no longer linked from `/`.
- Preview enhancements live in `aplus-preview/extensions/`; additive SQLite tables are installed by runtime initialization without changing the original schema version, preserving snapshots and reference sources.
- Every Student API request is intercepted before the original handler and derives ownership from its session; original broad APIs are denied to Student because staff projections are not safe for students.
- Financial extensions are read-only projections over original records; receipt links and installments never introduce new cash, and pending Accountant plan edits are applied through original management validation only after approval.
