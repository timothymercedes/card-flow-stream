import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useLegalStatus } from "@/hooks/useLegalStatus";
import { supabase } from "@/integrations/supabase/client";
import { REQUIRED_LEGAL_VERSION, legalAcceptanceMetadata } from "@/lib/legal";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Blocks logged-in users who pre-date the new agreements until they accept:
 *  - Age 18+
 *  - Terms of Service
 *  - Community Guidelines
 * Until accepted, no bidding / chat / purchase / hosting (UI is fully blocked).
 */
export function LegalGate() {
  const { user, loading } = useAuth();
  const { loading: legalLoading, needsAcceptance, refresh } = useLegalStatus();
  const [age, setAge] = useState(false);
  const [tos, setTos] = useState(false);
  const [guidelines, setGuidelines] = useState(false);
  const [notice, setNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!needsAcceptance) { setAge(false); setTos(false); setGuidelines(false); setNotice(false); }
  }, [needsAcceptance]);

  if (loading || legalLoading || !user || !needsAcceptance) return null;

  const canAccept = age && tos && guidelines && notice && !saving;

  async function accept() {
    if (!user) return;
    setSaving(true);
    const ua = navigator.userAgent.slice(0, 200);
    const { error } = await (supabase.rpc as any)("accept_required_legal_documents", {
      _version: REQUIRED_LEGAL_VERSION,
      _user_agent: ua,
    });
    if (error) { setSaving(false); toast.error("Couldn't save agreement. Please try again."); return; }
    await supabase.auth.updateUser({ data: legalAcceptanceMetadata() });
    await refresh();
    setSaving(false);
    toast.success("Thanks! You're all set.");
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
      <div className="flex w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-2xl max-h-[95vh]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="grid h-10 w-10 place-content-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold">One quick check before you continue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">We've updated our agreements. Please review and accept to keep using PullBid Live.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-muted-foreground">
            Until you accept, you won't be able to bid, chat, purchase, or host livestreams.
            You can still browse streams and the marketplace.
          </p>

          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={age} onChange={(e) => setAge(e.target.checked)} />
              <span className="text-sm">
                <strong>I'm 18 or older</strong> (or the age of majority in my jurisdiction).
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={tos} onChange={(e) => setTos(e.target.checked)} />
              <span className="text-sm">
                I agree to the{" "}
                <Link to="/legal/tos" target="_blank" className="text-primary underline">Terms of Service</Link>
                {" "}and{" "}
                <Link to="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>.
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={guidelines} onChange={(e) => setGuidelines(e.target.checked)} />
              <span className="text-sm">
                I have read and agree to the{" "}
                <Link to="/legal/community-guidelines" target="_blank" className="text-primary underline">Community Guidelines</Link>.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            <Link to="/legal/tos" target="_blank" className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted">View Terms</Link>
            <Link to="/legal/community-guidelines" target="_blank" className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted">View Guidelines</Link>
            <Link to="/legal/privacy" target="_blank" className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted">View Privacy</Link>
          </div>
        </div>

        <div className="space-y-2 border-t border-border px-5 py-4">
          <button
            disabled={!canAccept}
            onClick={accept}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Saving…" : "I Agree & Continue"}
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); }}
            className="w-full rounded-xl border border-border py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
