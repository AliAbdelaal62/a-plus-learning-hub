import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/crud-page";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({ meta: [{ title: "المعلمون — A+ Hub Academy" }] }),
  component: () => (
    <CrudPage
      table="teachers"
      title="teachers"
      orderBy="name"
      ascending
      fields={[
        { key: "name", label: "name", type: "text", required: true },
        { key: "specialty", label: "specialty", type: "text" },
        { key: "phone", label: "phone", type: "text" },
        { key: "email", label: "email", type: "text", hideInTable: true },
        { key: "currency", label: "currency", type: "text", default: "EGP" },
        { key: "hourly_rate", label: "hourlyRate", type: "number" },
        { key: "status", label: "status", type: "enum", options: ["active", "inactive"], default: "active" },
        { key: "notes", label: "notes", type: "textarea", hideInTable: true },
      ]}
    />
  ),
});
