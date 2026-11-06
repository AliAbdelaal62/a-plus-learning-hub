import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { entriesForDate, isoDate, type Entry } from "@/lib/schedule";
import { useLookup } from "@/components/crud-page";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم — A+ Hub Academy" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const teachers = useLookup("teachers");
  const students = useLookup("students");
  const subjects = useLookup("subjects");
  const now = new Date();
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

  const lessons = useQuery({
    queryKey: ["lessons", "month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase.from("lessons").select("*").gte("date", monthStart).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const timetable = useQuery({
    queryKey: ["timetable_entries", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("timetable_entries").select("*").order("start_time");
      if (error) throw error;
      return data as unknown as Entry[];
    },
  });

  const name = (list: { id: string; name?: unknown }[] | undefined, id: unknown) => (list?.find((x) => x.id === id)?.name as string) ?? "—";
  const done = (lessons.data ?? []).filter((l) => l.status === "completed");
  const stats: [TKey, number | string][] = [
    ["activeStudents", (students.data ?? []).filter((s) => s["status"] === "active").length],
    ["activeTeachers", (teachers.data ?? []).filter((s) => s["status"] === "active").length],
    ["lessonsMonth", done.length],
    ["hoursMonth", done.reduce((a, l) => a + Number(l.hours), 0).toFixed(1)],
  ];
  const today = entriesForDate(timetable.data ?? [], now);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-hero p-8 text-primary-foreground shadow-card">
        <p className="text-sm opacity-80">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-1 font-display text-4xl">{t("appName")}</h1>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-5 shadow-card">
            <div className="text-sm text-muted-foreground">{t(k)}</div>
            <div className="mt-2 font-display text-3xl text-primary">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 font-semibold">{t("todaySchedule")}</h2>
          {today.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothingToday")}</p>
          ) : (
            <ul className="divide-y">
              {today.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-primary">{e.start_time.slice(0, 5)}–{e.end_time.slice(0, 5)}</span>
                  <span>{name(subjects.data, e.subject_id)}</span>
                  <span className="text-muted-foreground">{name(teachers.data, e.teacher_id)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 font-semibold">{t("recentLessons")}</h2>
          {(lessons.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y">
              {(lessons.data ?? []).slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="text-muted-foreground">{l.date}</span>
                  <span>{name(students.data, l.student_id)}</span>
                  <span>{name(subjects.data, l.subject_id)}</span>
                  <Badge variant="secondary">{t(l.status as TKey)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
