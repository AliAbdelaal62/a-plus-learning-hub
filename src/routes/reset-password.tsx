import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور — A+ Hub Academy" },
      { name: "description", content: "اختر كلمة مرور جديدة لحسابك في A+ Hub" },
      { property: "og:title", content: "إعادة تعيين كلمة المرور — A+ Hub Academy" },
      { property: "og:description", content: "اختر كلمة مرور جديدة لحسابك في A+ Hub" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <h1 className="font-display text-3xl">{t("newPassword")}</h1>
        <div className="grid gap-1.5">
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" type="password" dir="ltr" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {t("savePassword")}
        </Button>
      </form>
    </div>
  );
}
