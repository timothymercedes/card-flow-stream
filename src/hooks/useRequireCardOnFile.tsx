/**
 * useRequireCardOnFile — small hook that components use to enforce the
 * "card on file required to bid" rule. Subscribes to the buyer's saved
 * cards via realtime and exposes:
 *
 *   - hasCard:        true if at least one saved card exists
 *   - showModal:      boolean for the SavePaymentMethodModal
 *   - openSaveModal:  open the modal explicitly
 *   - requireCard:    () => boolean. Call before placing a bid. Returns
 *                     true if user already has a card, otherwise opens
 *                     the save-card modal and returns false.
 *   - Modal:          the modal component (renders nothing if closed)
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SavePaymentMethodModal } from "@/components/SavePaymentMethodModal";

export function useRequireCardOnFile() {
  const { user } = useAuth();
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setHasCard(false); return; }
    const { count } = await supabase
      .from("buyer_payment_methods" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setHasCard((count ?? 0) > 0);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`buyer-pm-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "buyer_payment_methods", filter: `user_id=eq.${user.id}` },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const requireCard = useCallback((): boolean => {
    if (hasCard) return true;
    setShowModal(true);
    return false;
  }, [hasCard]);

  const Modal = (
    <SavePaymentMethodModal
      open={showModal}
      onClose={() => setShowModal(false)}
      onSaved={() => { setHasCard(true); refresh(); }}
    />
  );

  return {
    hasCard: !!hasCard,
    loading: hasCard === null,
    showModal,
    openSaveModal: () => setShowModal(true),
    requireCard,
    Modal,
  };
}
