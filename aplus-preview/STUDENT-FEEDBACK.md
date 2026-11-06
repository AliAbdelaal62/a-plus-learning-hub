# Student access and joint rescheduling

- Student Account details/password page and navigation entry removed. The former password
  operation returns 403; Admin still manages student credentials through Student Accounts.
- A student selects a subject and a specific upcoming lesson by date/time/teacher. Database
  booking identifiers are no longer a user-entered field. Choices include recurring timetable
  occurrences and managed bookings, scoped to the signed-in student, for the next 63 days.
- A request notifies the assigned teacher and active administrators. Both an Admin account
  and an account linked to that specific teacher must approve. Neither Coordinator nor an
  unrelated teacher can substitute. Either rejection ends the request without moving the lesson.
- Votes are idempotent, scoped, audited, and persisted. Changes are applied atomically with the
  second approval, including conflict checks, original booking availability checks, and stale
  source detection. Failed final approval rolls back its vote and the proposed movement.
- Recurring changes affect one occurrence and preserve the weekly series. Group lessons
  require the requester to acknowledge that the selected occurrence changes for the entire
  group. Affected students receive the resulting schedule-change notification without access
  to classmates' private records. No lesson charge, wage, payment or financial formula changes.
- Students have My Change Requests; teacher/Admin inboxes show the current/requested times
  and separate approval states. Decisions use an inline reason form instead of browser prompts.
- Shared Learning is renamed Learning Materials & Assignments / المحتوى والواجبات, with an
  explanation covering released files/links, assignments, submissions and published feedback.
  Private notes/drafts remain private by default.

Verification: 55 new workflow checks passed, including both approval orders, rejection,
unrelated-role denial, duplicate requests, group acknowledgement, weekly-series preservation,
financial-record preservation, managed-booking conflicts, rollback and restart persistence.
The previous 71 transfer/portal checks and 3 Vitest tests passed. Runtime generation and
production build passed. Browser verification covered Arabic student request selection,
teacher-first pending approval and Admin second approval. The browser initially revealed
unsupported prompt dialogs; replacing those with inline forms resolved that workflow.

Preview limitation remains unchanged: data/notifications are local to one browser, with no
shared server-side security boundary or cross-device delivery. No production data was used.
