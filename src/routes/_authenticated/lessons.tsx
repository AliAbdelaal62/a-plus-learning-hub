import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/crud-page";

export const Route = createFileRoute("/_authenticated/lessons")({
  head: () => ({ meta: [{ title: "الحصص — A+ Hub Academy" }] }),
  component: () => (
    <CrudPage
      table="lessons"
      title="lessons"
      orderBy="date"
      fields={[
        { key: "date", label: "date", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
        { key: "subject_id", label: "subject", type: "ref", ref: "subjects", required: true },
        { key: "teacher_id", label: "teacher", type: "ref", ref: "teachers", required: true },
        { key: "student_id", label: "student", type: "ref", ref: "students", required: true },
        { key: "hours", label: "hours", type: "number", required: true, default: 1 },
        { key: "status", label: "status", type: "enum", options: ["completed", "cancelled", "rescheduled", "no_show"], default: "completed" },
        { key: "start_time", label: "start", type: "time", hideInTable: true },
        { key: "end_time", label: "end", type: "time", hideInTable: true },
        { key: "teacher_rate", label: "teacherRate", type: "number", hideInTable: true },
        { key: "teacher_currency", label: "teacherCurrency", type: "text", hideInTable: true },
        { key: "student_rate", label: "studentRate", type: "number", hideInTable: true },
        { key: "student_currency", label: "studentCurrency", type: "text", hideInTable: true },
        { key: "notes", label: "notes", type: "textarea", hideInTable: true },
      ]}
      onFieldChange={(key, v, lookups) => {
        // Picking a subject fills in its teacher and agreed rates, as in the original system.
        if (key !== "subject_id") return {};
        const s = lookups.subjects.find((x) => x.id === v.subject_id);
        if (!s) return {};
        return {
          teacher_id: s.teacher_id ?? v.teacher_id,
          teacher_rate: s.teacher_rate ?? v.teacher_rate,
          teacher_currency: s.teacher_currency ?? v.teacher_currency,
          student_rate: s.student_rate ?? v.student_rate,
          student_currency: s.student_currency ?? v.student_currency,
        };
      }}
    />
  ),
});
