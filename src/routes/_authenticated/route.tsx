import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, GraduationCap, LayoutDashboard, LogOut, NotebookPen, Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { isAdmin, useAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

const nav: { to: string; label: TKey; icon: typeof Users; admin?: boolean }[] = [
  { to: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { to: "/students", label: "students", icon: GraduationCap },
  { to: "/teachers", label: "teachers", icon: Users },
  { to: "/subjects", label: "subjects", icon: BookOpen },
  { to: "/lessons", label: "lessons", icon: NotebookPen },
  { to: "/schedule", label: "schedule", icon: CalendarDays },
  { to: "/team", label: "team", icon: Shield, admin: true },
];

function AppLayout() {
  const { t, lang, setLang } = useI18n();
  const access = useAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const roles = access.data?.roles ?? [];

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <span className="font-display text-xl text-sidebar-primary">A+ Hub</span>
          <button className="text-xs underline-offset-4 hover:underline md:hidden" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
            {t("language")}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {nav
            .filter((n) => !n.admin || isAdmin(roles))
            .map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
                activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}
              >
                <n.icon className="size-4" />
                {t(n.label)}
              </Link>
            ))}
        </nav>
        <div className="hidden border-t border-sidebar-border p-4 text-xs md:block">
          <div className="mb-3 truncate opacity-80">{access.data?.email}</div>
          <div className="flex items-center justify-between">
            <button className="underline-offset-4 hover:underline" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {t("language")}
            </button>
            <button className="flex items-center gap-1 hover:text-sidebar-primary" onClick={signOut}>
              <LogOut className="size-3.5" /> {t("signOut")}
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-10">
        {access.isLoading ? null : roles.length === 0 ? (
          <div className="mx-auto mt-20 max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
            <h1 className="font-display text-2xl">{t("waiting")}</h1>
            <p className="mt-3 text-muted-foreground">{t("waitingBody")}</p>
            <Button variant="outline" className="mt-6" onClick={signOut}>
              {t("signOut")}
            </Button>
          </div>
        ) : (
          <Outlet />
        )}
        <div className="mt-10 md:hidden">
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> {t("signOut")}
          </Button>
        </div>
      </main>
    </div>
  );
}
