import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TutorialOnboarding } from "@/components/tutorials/TutorialOnboarding";
import { toast } from "sonner";
import { DepartmentInterestPicker } from '@/components/DepartmentInterestPicker';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Pick your interests — PullBid Live" }, {name:'description',content:'Choose optional shopping interests across collectibles and PullBid Live departments.'}, {property:'og:title',content:'Your interests — PullBid Live'}, {property:'og:description',content:'Personalize your discoveries while keeping every department available.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
  component: Onboarding,
});

function Onboarding() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"interests" | "videos">("interests");

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

  if (step === "videos") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-4 py-6">
        <TutorialOnboarding role="buyer" onDone={() => nav({ to: "/" })} />
        <Button
          onClick={() => nav({ to: "/" })}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          Enter PullBidLive
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl bg-background px-4 py-6 sm:px-8">
      <div className="mb-8 flex items-center gap-2"><img src={logo} alt="" width={36} height={36}/><span className="font-bold">PULL<span className="text-primary">BID</span> <span className="text-live">LIVE</span></span></div>
      {user && <DepartmentInterestPicker onboarding onDone={() => setStep('videos')} onSkip={() => void skip()}/>}
    </div>
  );
}
