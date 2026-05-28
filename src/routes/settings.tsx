import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Globe, Accessibility as A11yIcon, Store, Bell, ShieldCheck, CreditCard, User as UserIcon, MapPin, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { writeA11yLocal, readA11yLocal } from "@/components/A11yClassSync";
import { toast } from "sonner";
import { NotificationSettings } from "@/components/NotificationSettings";
import { ShippingAddressForm } from "@/components/ShippingAddressForm";
import { StorefrontBrandingEditor } from "@/components/StorefrontBrandingEditor";
import { useTour } from "@/components/MascotGuide";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PullBid Live" }] }),
  component: SettingsPage,
});

type Section = "account" | "shipping" | "notifications" | "language" | "privacy" | "payment" | "accessibility" | "seller" | "tutorials";

function SettingsPage() {
  const { user, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [section, setSection] = useState<Section>("language");

  if (!user) {
    return (
      <AppShell>
        <div className="p-8 text-center text-sm">
          <p>Please sign in.</p>
          <Link to="/auth" className="mt-3 inline-block text-primary text-xs font-bold">Sign in</Link>
        </div>
      </AppShell>
    );
  }

  const sections: { key: Section; label: string; icon: any }[] = [
    { key: "account", label: t("settings.account"), icon: UserIcon },
    { key: "shipping", label: t("settings.shipping", "Shipping"), icon: MapPin },
    { key: "language", label: t("settings.language"), icon: Globe },
    { key: "accessibility", label: t("settings.accessibility"), icon: A11yIcon },
    { key: "notifications", label: t("settings.notifications"), icon: Bell },
    { key: "tutorials" as Section, label: t("settings.tutorials", "Tutorials"), icon: Sparkles },
    { key: "privacy", label: t("settings.privacy"), icon: ShieldCheck },
    { key: "payment", label: t("settings.payment"), icon: CreditCard },
    ...(profile?.is_seller ? [{ key: "seller" as Section, label: t("settings.seller"), icon: Store }] : []),
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-4 space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight lg:text-3xl">{t("settings.title")}</h1>


        <div className="flex gap-1 overflow-x-auto pb-1">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setSection(s.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${section === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </button>
            );
          })}
        </div>

        {section === "language" && <LanguageSection />}
        {section === "accessibility" && <AccessibilitySection />}
        {section === "seller" && profile?.is_seller && <SellerSection />}
        {section === "account" && <AccountSection />}
        {section === "shipping" && <ShippingAddressForm />}
        {section === "notifications" && <NotificationSettings />}
        {section === "privacy" && <ComingSoon label={t("settings.privacy")} />}
        {section === "payment" && <PaymentSection />}
        {section === "tutorials" && <TutorialsSection />}
      </div>
    </AppShell>
  );
}

function LanguageSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function pick(code: string) {
    if (busy) return;
    setBusy(true);
    await i18n.changeLanguage(code);
    if (user) {
      await supabase.from("profiles").update({ preferred_language: code }).eq("id", user.id);
    }
    toast.success(t("settings.saved"));
    setBusy(false);
  }

  return (
    <div className="rounded-xl bg-card p-4 space-y-3">
      <p className="text-sm font-bold">{t("settings.language_label")}</p>
      <p className="text-xs text-muted-foreground">{t("settings.language_help")}</p>
      <div className="grid grid-cols-2 gap-2">
        {SUPPORTED_LANGUAGES.map(l => (
          <button key={l.code} onClick={() => pick(l.code)}
            className={`flex items-center gap-2 rounded-lg p-2.5 text-left text-sm ${i18n.language?.startsWith(l.code) ? "bg-primary/15 ring-1 ring-primary text-foreground" : "bg-muted hover:bg-muted/70"}`}>
            <span className="text-lg">{l.flag}</span>
            <span className="font-semibold">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AccessibilitySection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [s, setS] = useState(() => readA11yLocal());

  async function toggle(key: keyof typeof s) {
    const next = { ...s, [key]: !s[key] };
    setS(next);
    writeA11yLocal(next);
    if (user) {
      await supabase.from("profiles").update({ a11y_settings: next }).eq("id", user.id);
    }
  }

  const rows: { key: keyof typeof s; label: string }[] = [
    { key: "large_text", label: t("settings.a11y_large_text") },
    { key: "high_contrast", label: t("settings.a11y_high_contrast") },
    { key: "reduced_motion", label: t("settings.a11y_reduced_motion") },
    { key: "captions_default", label: t("settings.a11y_captions_default") },
  ];

  return (
    <div className="rounded-xl bg-card p-2 divide-y divide-border">
      {rows.map(r => (
        <button key={r.key} onClick={() => toggle(r.key)}
          className="flex w-full items-center justify-between p-3 text-left">
          <span className="text-sm">{r.label}</span>
          <span className={`relative inline-flex h-5 w-9 rounded-full transition ${s[r.key] ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${s[r.key] ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
      ))}
    </div>
  );
}

function SellerSection() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const p = profile as any;
  const [name, setName] = useState(p?.shop_name || "");
  const [busy, setBusy] = useState(false);
  const changes = p?.shop_name_changes ?? 0;
  const locked = changes >= 1 && !!p?.shop_name;

  async function save() {
    if (!name.trim() || name.trim() === p?.shop_name) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("change_shop_name", { _new_name: name.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("settings.saved"));
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 space-y-3">
        <p className="text-sm font-bold">{t("settings.shop_name")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.shop_name_help")}</p>
        <input value={name} onChange={e => setName(e.target.value)} disabled={locked}
          className="w-full rounded-lg bg-input px-3 py-2 text-sm disabled:opacity-50" maxLength={30} />
        <button onClick={save} disabled={busy || locked || !name.trim() || name.trim() === p?.shop_name}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
          {locked ? "Already used your one change" : t("settings.shop_name_change")}
        </button>
      </div>
      <StorefrontBrandingEditor />
    </div>
  );
}

function AccountSection() {
  const { user } = useAuth();
  return (
    <div className="rounded-xl bg-card p-4 space-y-2 text-sm">
      <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
      <Link to="/profile" className="inline-block text-xs font-bold text-primary">Edit profile →</Link>
    </div>
  );
}

function PaymentSection() {
  return (
    <div className="rounded-xl bg-card p-4 space-y-2 text-sm">
      <p>Manage saved payment methods at checkout.</p>
      <Link to="/payouts" className="inline-block text-xs font-bold text-primary">Seller payouts →</Link>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return <div className="rounded-xl bg-card p-6 text-center text-xs text-muted-foreground">{label} — coming soon.</div>;
}
