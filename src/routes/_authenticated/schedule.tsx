import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/crud-page";
import { useI18n, WEEKDAYS } from "@/lib/i18n";
import { entriesForDate, startOfWeek, addDays, isoDate } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "الجدول — A+ Hub Academy" }] }),
  component: SchedulePage,
});

function SchedulePage() {
  const { t, lang } = useI18n();
  return (
    <CrudPage
      table="timetable_entries"
      title="schedule"
      orderBy="start_time"
      ascending
      fields={[
        { key: "recurring", label: "recurring", type: "bool" },
        { key: "date", label: "date", type: "date", showIf: (v) => !v.recurring },
        { key: "weekday", label: "weekday", type: "weekday", showIf: (v) => !!v.recurring },
        { key: "start_time", label: "start", type: "time", required: true },
        { key: "end_time", label: "end", type: "time", required: true },
        { key: "subject_id", label: "subject", type: "ref", ref: "subjects" },
        { key: "teacher_id", label: "teacher", type: "ref", ref: "teachers" },
        { key: "student_id", label: "student", type: "ref", ref: "students" },
        { key: "notes", label: "notes", type: "textarea", hideInTable: true },
      ]}
      above={(rows, lookups) => {
        const start = startOfWeek(new Date());
        const name = (list: { id: string; name?: unknown }[], id: unknown) => (list.find((x) => x.id === id)?.name as string) ?? "";
        return (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">{t("thisWeek")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(start, i);
                const items = entriesForDate(rows as never, d);
                const today = isoDate(d) === isoDate(new Date());
                return (
                  <div key={i} className={`rounded-xl border bg-card p-3 shadow-card ${today ? "ring-2 ring-gold" : ""}`}>
                    <div className="mb-2 flex items-baseline justify-between text-sm">
                      <span className="font-semibold">{WEEKDAYS[lang][d.getDay()]}</span>
                      <span className="text-muted-foreground">{d.getDate()}/{d.getMonth() + 1}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((e) => (
                        <div key={e.id} className="rounded-md bg-secondary px-2 py-1.5 text-xs text-secondary-foreground">
                          <div className="font-semibold">{e.start_time.slice(0, 5)}–{e.end_time.slice(0, 5)}</div>
                          <div>{name(lookups.subjects, e.subject_id)}</div>
                          <div className="opacity-75">{name(lookups.teachers, e.teacher_id)} · {name(lookups.students, e.student_id)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      }}
    />
  );
}
