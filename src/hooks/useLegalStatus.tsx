import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { REQUIRED_LEGAL_DOCS, REQUIRED_LEGAL_VERSION, hasCompletedRequiredAgreementsFromMetadata } from "@/lib/legal";
import { useTutorialMode } from "@/lib/tutorialMode";

type LegalStatus = {
  loading: boolean;
  needsAcceptance: boolean;
  refresh: () => Promise<void>;
};

export function useLegalStatus(): LegalStatus {
  const { user, loading } = useAuth();
  const tutorial = useTutorialMode();
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);

  async function refresh() {
    if (tutorial) {
      setNeedsAcceptance(false);
      setChecking(false);
      return;
    }
    if (!user) {
      setNeedsAcceptance(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    const profileQuery = supabase
      .from("profiles")
      .select("age_verified,tos_accepted,guidelines_accepted,agreements_version,agreements_review_required")
      .eq("id", user.id)
      .maybeSingle();
    const docsQuery = supabase
      .from("legal_acceptances")
      .select("document_type, version")
      .eq("user_id", user.id)
      .eq("version", REQUIRED_LEGAL_VERSION)
      .in("document_type", REQUIRED_LEGAL_DOCS as unknown as string[]);

    const [{ data: profile }, { data: docs }] = await Promise.all([profileQuery, docsQuery]);
    const profileOk = !!profile &&
      (profile as any).age_verified === true &&
      (profile as any).tos_accepted === true &&
      (profile as any).guidelines_accepted === true &&
      (profile as any).agreements_version === REQUIRED_LEGAL_VERSION &&
      (profile as any).agreements_review_required !== true;
    const docsHave = new Set((docs ?? []).map((r) => r.document_type));
    const docsOk = REQUIRED_LEGAL_DOCS.every((doc) => docsHave.has(doc));
    const metadataOk = hasCompletedRequiredAgreementsFromMetadata(user);
    if (metadataOk && (!profileOk || !docsOk)) {
      await (supabase.rpc as any)("accept_required_legal_documents", {
        _version: REQUIRED_LEGAL_VERSION,
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "metadata-sync",
      });
    }
    setNeedsAcceptance(!(profileOk || docsOk || metadataOk));
    setChecking(false);
  }

  useEffect(() => {
    if (tutorial) {
      setNeedsAcceptance(false);
      setChecking(false);
      return;
    }
    if (loading) return;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, user?.user_metadata?.agreements_version, user?.user_metadata?.agreements_review_required, tutorial]);

  return { loading: loading || checking, needsAcceptance, refresh };
}