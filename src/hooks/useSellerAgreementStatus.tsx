import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SELLER_AGREEMENT_VERSION } from "@/lib/legal";
import { useTutorialMode } from "@/lib/tutorialMode";

/**
 * Tracks whether the current user (only if seller/host status is approved or pending)
 * needs to accept the latest Seller / Host Agreement.
 * Buyers and unverified users are never prompted.
 */
export function useSellerAgreementStatus() {
  const { user, loading } = useAuth();
  const tutorial = useTutorialMode();
  const [checking, setChecking] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [isSellerOrHost, setIsSellerOrHost] = useState(false);

  const refresh = useCallback(async () => {
    if (tutorial) {
      setIsSellerOrHost(true);
      setNeedsAcceptance(false);
      setChecking(false);
      return;
    }
    if (!user) {
      setNeedsAcceptance(false);
      setIsSellerOrHost(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    const { data } = await supabase
      .from("profiles")
      .select("is_seller, seller_status, seller_agreement_version, seller_agreement_review_required")
      .eq("id", user.id)
      .maybeSingle();

    const p = data as any;
    const sellerOrHost =
      !!p && (p.is_seller === true || ["approved", "pending"].includes(p.seller_status));
    setIsSellerOrHost(sellerOrHost);

    if (!sellerOrHost) {
      setNeedsAcceptance(false);
    } else {
      const versionOk = p.seller_agreement_version === SELLER_AGREEMENT_VERSION;
      const reviewRequired = p.seller_agreement_review_required === true;
      setNeedsAcceptance(!versionOk || reviewRequired);
    }
    setChecking(false);
  }, [user, tutorial]);

  useEffect(() => {
    if (loading) return;
    refresh();
  }, [loading, refresh]);

  return { loading: loading || checking, needsAcceptance, isSellerOrHost, refresh };
}
