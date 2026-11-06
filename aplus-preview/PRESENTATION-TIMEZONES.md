# Grouped navigation, visible submission feedback, and student timezones

## Navigation and presentation

Extension links now live alongside the relevant original routes: Workspace, Scheduling,
Academy, Finance, Operations, and Administration. There is no separate Added Sections group.
Original route elements and handlers are moved, not replaced. Each role still receives only
its authorized links. Extension pages share icons, headings, descriptions, table styling,
form spacing, focus states, empty states, RTL and theme tokens. Native-route navigation clears
the extension active state, and extension breadcrumbs show the correct section/page.

Student rescheduling now shows validation directly beside the send button. An unchanged
date/time receives an explicit localized explanation. Required fields/group acknowledgement,
backend refusals, successful delivery, and a link to track approval are visible. Draft values
are retained on failure, and repeat submission is disabled after success. The backend still
requires both approvals and performs its original collision/ownership checks.

## Student country / timezone

The Schedule page offers Egypt/Cairo (`Africa/Cairo`), Kuwait (`Asia/Kuwait`) and United Kingdom/
London (`Europe/London`). A separate preference is stored for each student. Only the signed-in
student can change their own preference; supplied student identifiers cannot change ownership.
No Account Details/password page is reintroduced.

Upcoming lesson times, next-lesson displays, lesson-choice labels and rescheduling requests use
the student's preference. Staff review remains explicitly labelled in academy Cairo time.
Stored timetable entries and financial records are not changed by choosing a country.
Calendar-only financial/deadline records are not revalued or guessed from missing clock times.

IANA timezone rules through `Intl` handle daylight saving, including periods when Cairo and
London switch on different dates. Ambiguous or nonexistent local times are rejected rather
than silently shifted. Date rollover is explicit through start/end dates. As with the existing
academy scheduling model, a requested session must fit inside one Cairo calendar day.

Requests are converted to canonical academy time once before recording. Both approvals apply
that exact stored proposal; subsequent preference changes only affect display. Stale forms
with a different saved timezone are refused. Changing timezone preserves a valid unsent draft
by converting its actual times, keeping the selected lesson and reason. Preferences persist
in the preview SQLite database, and full database backups include the new table automatically.

## Verification

- 217 DOM interaction checks across Admin, Accountant, Coordinator, Teacher and Student in
  English/Arabic: grouping, permissions, original route handlers, icons, active states, local
  validation, refusal/success feedback, duplicate-submit protection and timezone draft retention.
- 40 timezone checks: winter/summer, different Cairo/London transition dates, nonexistent and
  ambiguous UK times, date rollover, canonical proposals, role/ownership enforcement, approval
  conversion, persistence and stale-preference rejection.
- Existing 55 joint-approval checks and 71 transfer/portal checks continue to pass.
- Existing Vitest suite: 3 tests passed. Runtime generation and full production build passed.
- Browser verified original/new Admin navigation, Arabic same-time feedback and successful
  changed-time submission. Country selector and live Kuwait conversion were observed.
- A narrow-screen automation attempt could not reliably target the drawer; its viewport
  override was reset. This is not claimed as completed mobile end-to-end coverage.

Original reference sources, financial calculations and port-3000 data are untouched. All tests
use synthetic records. Preview storage and notifications remain local to the browser.
