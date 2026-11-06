import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/crud-page";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "الطلاب — A+ Hub Academy" }] }),
  component: () => (
    <CrudPage
      table="students"
      title="students"
      orderBy="name"
      ascending
      fields={[
        { key: "name", label: "name", type: "text", required: true },
        { key: "university", label: "university", type: "text" },
        { key: "major", label: "major", type: "text" },
        { key: "level", label: "level", type: "text" },
        { key: "country", label: "country", type: "text", hideInTable: true },
        { key: "currency", label: "currency", type: "text", default: "EGP" },
        { key: "phone", label: "phone", type: "text" },
        { key: "email", label: "email", type: "text", hideInTable: true },
        { key: "status", label: "status", type: "enum", options: ["active", "inactive"], default: "active" },
        { key: "notes", label: "notes", type: "textarea", hideInTable: true },
      ]}
    />
  ),
});
