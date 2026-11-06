import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { isAdmin, useAccess, type Role } from "@/lib/access";
import { PageHeader, useLookup } from "@/components/crud-page";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "الفريق — A+ Hub Academy" }] }),
  component: TeamPage,
});

const ROLES: Role[] = ["admin", "coordinator", "accountant", "teacher"];
const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function TeamPage() {
  const { t } = useI18n();
  const access = useAccess();
  const qc = useQueryClient();
  const teachers = useLookup("teachers");
  const admin = isAdmin(access.data?.roles ?? []);

  const members = useQuery({
    enabled: admin,
    queryKey: ["team"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      return (p.data ?? []).map((m) => ({ ...m, role: (r.data ?? []).find((x) => x.user_id === m.id)?.role ?? null }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role, teacher }: { id: string; role: string; teacher: string | null }) => {
      const res =
        role === ""
          ? await supabase.rpc("remove_user_access", { _user_id: id })
          : await supabase.rpc("set_user_role", teacher ? { _user_id: id, _role: role as Role, _teacher_id: teacher } : { _user_id: id, _role: role as Role });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!admin) return <p className="text-muted-foreground">{t("adminOnly")}</p>;

  return (
    <div>
      <PageHeader title={t("team")} />
      <p className="mb-6 text-sm text-muted-foreground">{t("teamHelp")}</p>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("email")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("role")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("linkedTeacher")}</th>
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-3">{m.display_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    aria-label={t("role")}
                    className={selectCls}
                    value={m.role ?? ""}
                    onChange={(e) => {
                      const role = e.target.value;
                      if (role === "teacher" && !m.teacher_id) {
                        toast.error(t("linkedTeacher") + ": " + t("required"));
                        return;
                      }
                      setRole.mutate({ id: m.id, role, teacher: m.teacher_id });
                    }}
                  >
                    <option value="">{t("noRole")}</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={t("linkedTeacher")}
                    className={selectCls}
                    value={m.teacher_id ?? ""}
                    onChange={(e) => setRole.mutate({ id: m.id, role: "teacher", teacher: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {(teachers.data ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x["name"] as string}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
