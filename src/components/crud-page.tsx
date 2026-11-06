import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, WEEKDAYS, type TKey } from "@/lib/i18n";
import { canEdit, useAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = Record<string, unknown> & { id: string };
export type LookupTable = "teachers" | "students" | "subjects";

export type Field = {
  key: string;
  label: TKey;
  type: "text" | "number" | "date" | "time" | "textarea" | "bool" | "enum" | "ref" | "weekday";
  options?: string[];
  ref?: LookupTable;
  required?: boolean;
  default?: unknown;
  hideInTable?: boolean;
  showIf?: (v: Record<string, unknown>) => boolean;
};

export function useLookup(table: LookupTable) {
  return useQuery({
    queryKey: [table, "lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl text-foreground">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function CrudPage({
  table,
  title,
  fields,
  orderBy = "created_at",
  ascending = false,
  onFieldChange,
  above,
}: {
  table: "teachers" | "students" | "subjects" | "lessons" | "timetable_entries";
  title: TKey;
  fields: Field[];
  orderBy?: string;
  ascending?: boolean;
  onFieldChange?: (key: string, values: Record<string, unknown>, lookups: Record<LookupTable, Row[]>) => Record<string, unknown>;
  above?: (rows: Row[], lookups: Record<LookupTable, Row[]>) => ReactNode;
}) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const access = useAccess();
  const editable = canEdit(access.data?.roles ?? []);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const teachers = useLookup("teachers");
  const students = useLookup("students");
  const subjects = useLookup("subjects");
  const lookups = { teachers: teachers.data ?? [], students: students.data ?? [], subjects: subjects.data ?? [] };
  const nameOf = (ref: LookupTable, id: unknown) => (lookups[ref].find((r) => r.id === id)?.["name"] as string) ?? "—";

  const list = useQuery({
    queryKey: [table, "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const display = (f: Field, v: unknown): ReactNode => {
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
    if (f.type === "ref" && f.ref) return nameOf(f.ref, v);
    if (f.type === "enum") return <Badge variant="secondary">{t(v as TKey)}</Badge>;
    if (f.type === "bool") return v ? t("yes") : t("no");
    if (f.type === "weekday") return WEEKDAYS[lang][v as number];
    if (f.type === "time") return String(v).slice(0, 5);
    return String(v);
  };

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      fields.some((f) => {
        const v = r[f.key];
        const s = f.type === "ref" && f.ref ? nameOf(f.ref, v) : String(v ?? "");
        return s.toLowerCase().includes(needle);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, q, teachers.data, students.data, subjects.data]);

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        let v = values[f.key];
        if (f.showIf && !f.showIf(values)) v = null;
        if (v === "" || v === undefined) v = null;
        if ((f.type === "number" || f.type === "weekday") && v !== null) v = Number(v);
        if (f.type === "bool") v = Boolean(v);
        payload[f.key] = v;
      }
      const id = values["id"] as string | undefined;
      const res = id
        ? await supabase.from(table).update(payload as never).eq("id", id)
        : await supabase.from(table).insert(payload as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("deleted"));
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    const init: Record<string, unknown> = {};
    fields.forEach((f) => (init[f.key] = f.default ?? (f.type === "bool" ? false : "")));
    setEditing(init);
  };

  const setVal = (key: string, v: unknown) =>
    setEditing((cur) => {
      if (!cur) return cur;
      let next = { ...cur, [key]: v };
      if (onFieldChange) next = { ...next, ...onFieldChange(key, next, lookups) };
      return next;
    });

  const cols = fields.filter((f) => !f.hideInTable);

  return (
    <div>
      <PageHeader title={t(title)}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-56 bg-card" />
        {editable ? (
          <Button onClick={openNew}>
            <Plus className="size-4" /> {t("add")}
          </Button>
        ) : (
          <Badge variant="outline">{t("readOnly")}</Badge>
        )}
      </PageHeader>

      {above?.(list.data ?? [], lookups)}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {cols.map((f) => (
                <th key={f.key} className="whitespace-nowrap px-4 py-3 text-start font-medium">
                  {t(f.label)}
                </th>
              ))}
              {editable && <th className="w-24" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t transition-colors hover:bg-muted/40">
                {cols.map((f) => (
                  <td key={f.key} className="whitespace-nowrap px-4 py-3">
                    {display(f, r[f.key])}
                  </td>
                ))}
                {editable && (
                  <td className="px-2 py-2 text-end">
                    <Button size="icon" variant="ghost" aria-label={t("edit")} onClick={() => setEditing({ ...r })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("delete")}
                      onClick={() => window.confirm(t("confirmDelete")) && remove.mutate(r.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {!list.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-4 py-12 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.["id"] ? t("edit") : t("add")} — {t(title)}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              id="crud-form"
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editing);
              }}
            >
              {fields
                .filter((f) => !f.showIf || f.showIf(editing))
                .map((f) => (
                  <div key={f.key} className={f.type === "textarea" ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
                    <Label htmlFor={f.key}>{t(f.label)}</Label>
                    <FieldInput f={f} value={editing[f.key]} onChange={(v) => setVal(f.key, v)} lookups={lookups} />
                  </div>
                ))}
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="crud-form" disabled={save.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldInput({
  f,
  value,
  onChange,
  lookups,
}: {
  f: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  lookups: Record<LookupTable, Row[]>;
}) {
  const { t, lang } = useI18n();
  const v = (value ?? "") as string;
  if (f.type === "textarea") return <Textarea id={f.key} value={v} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === "bool")
    return (
      <input id={f.key} type="checkbox" className="size-5 accent-primary" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    );
  if (f.type === "enum")
    return (
      <select id={f.key} className={selectCls} value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {t(o as TKey)}
          </option>
        ))}
      </select>
    );
  if (f.type === "weekday")
    return (
      <select id={f.key} className={selectCls} value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {WEEKDAYS[lang].map((d, i) => (
          <option key={i} value={i}>
            {d}
          </option>
        ))}
      </select>
    );
  if (f.type === "ref" && f.ref)
    return (
      <select id={f.key} className={selectCls} value={v} required={f.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {lookups[f.ref].map((r) => (
          <option key={r.id} value={r.id}>
            {r["name"] as string}
          </option>
        ))}
      </select>
    );
  return (
    <Input
      id={f.key}
      type={f.type}
      step={f.type === "number" ? "0.01" : undefined}
      value={f.type === "time" ? v.slice(0, 5) : v}
      required={f.required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
