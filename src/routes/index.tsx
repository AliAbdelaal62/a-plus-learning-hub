import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "A+ Hub Academy — نظام إدارة الأكاديمية" },
      { name: "description", content: "إدارة الطلاب والمعلمين والمواد والحصص والجدول لأكاديمية A+ Hub." },
      { property: "og:title", content: "A+ Hub Academy — نظام إدارة الأكاديمية" },
      { property: "og:description", content: "إدارة الطلاب والمعلمين والمواد والحصص والجدول لأكاديمية A+ Hub." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-hero text-primary-foreground">
      <header className="flex items-center justify-between px-8 py-6">
        <span className="font-display text-2xl text-gold">A+ Hub</span>
        <button className="text-sm opacity-85 hover:opacity-100" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          {t("language")}
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-5xl md:text-7xl">{t("appName")}</h1>
        <p className="mt-5 max-w-xl text-lg opacity-85">{t("tagline")}</p>
        <Button asChild size="lg" className="mt-10 bg-gold text-gold-foreground hover:bg-gold/90">
          <Link to="/dashboard">{t("openApp")}</Link>
        </Button>
      </main>
    </div>
  );
}
