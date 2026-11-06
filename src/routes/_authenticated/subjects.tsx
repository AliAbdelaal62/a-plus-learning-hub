import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/crud-page";

export const Route = createFileRoute("/_authenticated/subjects")({
  head: () => ({ meta: [{ title: "المواد — A+ Hub Academy" }] }),
  component: () => (
    <CrudPage
      table="subjects"
      title="subjects"
      orderBy="name"
      ascending
      fields={[
        { key: "name", label: "name", type: "text", required: true },
        { key: "type", label: "type", type: "enum", options: ["live", "recorded", "project"], default: "live" },
        { key: "university", label: "university", type: "text" },
        { key: "level", label: "level", type: "text" },
        { key: "teacher_id", label: "teacher", type: "ref", ref: "teachers" },
        { key: "teacher_rate", label: "teacherRate", type: "number" },
        { key: "teacher_currency", label: "teacherCurrency", type: "text", default: "EGP", hideInTable: true },
        { key: "student_rate", label: "studentRate", type: "number" },
        { key: "student_currency", label: "studentCurrency", type: "text", default: "EGP", hideInTable: true },
      ]}
    />
  ),
});
