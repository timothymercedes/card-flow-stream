import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TutorialOnboarding } from "@/components/tutorials/TutorialOnboarding";
import { toast } from "sonner";
import { DepartmentInterestPicker } from '@/components/DepartmentInterestPicker';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/AppShell';

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Pick your interests — PullBid Live" }, {name:'description',content:'Choose optional shopping interests across collectibles and PullBid Live departments.'}, {property:'og:title',content:'Your interests — PullBid Live'}, {property:'og:description',content:'Personalize your discoveries while keeping every department available.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"interests" | "reasons" | "goals" | "videos">("interests")
  const [reasons, setReasons] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);;

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function skip() {
    if (!user || saving) return;
    setSaving(true);
    const {error} = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    setSaving(false);
    if (error) {toast.error('Please try again.'); return;}
    nav({ to: "/" });
  }

  async function saveChoices() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ onboarding_reasons: reasons, collector_goals: goals }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error("Please try again."); return; }
    setStep("videos");
  }

  if (step === "reasons" || step === "goals") {
    const isReasons = step === "reasons";
    const options = isReasons ? REASONS : GOALS;
    const picked = isReasons ? reasons : goals;
    const set = isReasons ? setReasons : setGoals;
    return (
      <AppShell><div className="mx-auto max-w-md px-4 py-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Step {isReasons ? 2 : 3} of 3</p>
        <h1 className="mt-1 text-2xl font-extrabold">{isReasons ? "What brings you here?" : "What are your goals?"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick as many as you like. You can change this anytime.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {options.map(o => {
            const on = picked.includes(o.key);
            return (
              <button key={o.key} aria-pressed={on} onClick={() => set(on ? picked.filter(k => k !== o.key) : [...picked, o.key])}
                className={`rounded-2xl p-3 text-left text-sm font-bold ring-1 transition ${on ? "bg-primary/10 text-primary ring-primary" : "bg-card ring-border hover:bg-muted"}`}>
                <span className="mb-1 block text-xl" aria-hidden>{o.emoji}</span>{o.label}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => isReasons ? setStep("goals") : setStep("videos")}>Skip</Button>
          <Button className="flex-1" disabled={saving} onClick={() => isReasons ? setStep("goals") : void saveChoices()}>Continue</Button>
        </div>
      </div></AppShell>
    );
  }

  if (step === "videos") {
    return (
      <AppShell><div className="mx-auto flex max-w-md flex-col bg-background px-4 py-6">
        <TutorialOnboarding role="buyer" onDone={() => nav({ to: "/" })} />
        <Button
          onClick={() => nav({ to: "/" })}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          Enter PullBidLive
        </Button>
      </div></AppShell>
    );
  }

  return (
    <AppShell><div className="mx-auto max-w-6xl bg-background px-4 py-6 sm:px-8">
      {user && <DepartmentInterestPicker onboarding onDone={() => setStep('reasons')} onSkip={() => void skip()}/>}
    </div></AppShell>
  );
}

const REASONS = [
  { key: "collecting", label: "Collecting", emoji: "🗂️" },
  { key: "trading", label: "Trading", emoji: "🔁" },
  { key: "buying", label: "Buying", emoji: "🛍️" },
  { key: "selling", label: "Selling", emoji: "💰" },
  { key: "live_shows", label: "Live shows", emoji: "📺" },
  { key: "building", label: "Building collections", emoji: "🧱" },
  { key: "communities", label: "Joining communities", emoji: "👥" },
];
const GOALS = [
  { key: "complete_sets", label: "Complete sets", emoji: "✅" },
  { key: "build_value", label: "Build value", emoji: "📈" },
  { key: "trade", label: "Trade", emoji: "🤝" },
  { key: "sell", label: "Sell", emoji: "🏷️" },
  { key: "grow_vault", label: "Grow my Vault", emoji: "🔐" },
  { key: "discover", label: "Discover communities", emoji: "🧭" },
];
