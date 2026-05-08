import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LISTING_CATEGORIES } from "@/lib/listingCategories";
import { TutorialOnboarding } from "@/components/tutorials/TutorialOnboarding";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Pick your interests — PullBid Live" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"interests" | "videos">("interests");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  function toggle(v: string) {
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  }

  async function save() {
    if (!user) return;
    if (picked.length === 0) return toast.error("Pick at least one — you can change later");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ interests: picked, onboarding_completed: true })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Personalized for you 🎯");
    nav({ to: "/" });
  }

  async function skip() {
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    nav({ to: "/" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-4 py-6">
      <div className="mb-4 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold">What do you collect?</h1>
        <p className="mt-1 text-xs text-muted-foreground">Pick a few — we'll show you streams & posts you'll love.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LISTING_CATEGORIES.map((c) => {
          const active = picked.includes(c.value);
          return (
            <button
              key={c.value}
              onClick={() => toggle(c.value)}
              className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left text-sm transition ${
                active ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="font-medium">{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : `Continue (${picked.length})`}
        </button>
        <button onClick={skip} className="mt-2 w-full py-2 text-xs text-muted-foreground">
          Skip for now
        </button>
      </div>
    </div>
  );
}
