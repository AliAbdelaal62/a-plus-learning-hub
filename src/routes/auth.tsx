import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — A+ Hub Academy" },
      { name: "description", content: "دخول فريق أكاديمية A+ Hub إلى نظام الإدارة" },
      { property: "og:title", content: "تسجيل الدخول — A+ Hub Academy" },
      { property: "og:description", content: "دخول فريق أكاديمية A+ Hub إلى نظام الإدارة" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { display_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else setNotice(t("checkEmail"));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        setNotice(t("resetSent"));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-hero p-12 text-primary-foreground lg:flex">
        <span className="font-display text-2xl text-gold">A+ Hub</span>
        <div>
          <h1 className="font-display text-5xl leading-tight">{t("appName")}</h1>
          <p className="mt-4 max-w-sm text-lg opacity-85">{t("tagline")}</p>
        </div>
        <span />
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl">{mode === "up" ? t("signUp") : mode === "forgot" ? t("forgot") : t("signIn")}</h2>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {t("language")}
            </button>
          </div>
          {notice && <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">{notice}</p>}
          {mode === "up" && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">{t("displayName")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode !== "forgot" && (
            <div className="grid gap-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" dir="ltr" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "up" ? t("signUp") : mode === "forgot" ? t("sendReset") : t("signIn")}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            {mode === "in" ? (
              <>
                <button type="button" className="text-primary hover:underline" onClick={() => setMode("up")}>
                  {t("noAccount")} {t("signUp")}
                </button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMode("forgot")}>
                  {t("forgot")}
                </button>
              </>
            ) : (
              <button type="button" className="text-primary hover:underline" onClick={() => setMode("in")}>
                {t("haveAccount")} {t("signIn")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
