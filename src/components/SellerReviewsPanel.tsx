/**
 * SellerReviewsPanel — full reviews tab for seller storefront / own profile.
 *
 * Powered by `get_seller_recent_reviews`, which joins seller/buyer responses
 * and verified flags in a single round-trip. Live-updated via the resilient
 * `useRealtimeTable` hook on `seller_reviews` AND `review_responses` so the
 * panel stays in sync when:
 *   - a new buyer leaves a review during a live auction
 *   - the seller posts a response from another device / Seller Hub
 *   - the buyer replies to a seller response
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { ReviewCard, type ReviewRow } from "@/components/ReviewCard";
import { Loader2 } from "lucide-react";

export function SellerReviewsPanel({
  sellerId,
  currentUserId,
  limit = 50,
}: {
  sellerId: string;
  currentUserId?: string | null;
  limit?: number;
}) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sellerId) return;
    const { data, error } = await (supabase.rpc as any)("get_seller_recent_reviews", {
      _seller_id: sellerId,
      _limit: limit,
    });
    if (!error && Array.isArray(data)) {
      setReviews(data as ReviewRow[]);
    }
    setLoading(false);
  }, [sellerId, limit]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Resilient realtime — auto-reconnects, no duplicate listeners.
  useRealtimeTable(
    {
      name: `seller-reviews-panel-${sellerId}`,
      table: "seller_reviews",
      filter: `seller_id=eq.${sellerId}`,
      enabled: !!sellerId,
      debounceMs: 250,
    },
    () => load(),
  );
  useRealtimeTable(
    {
      name: `seller-review-responses-${sellerId}`,
      table: "review_responses",
      enabled: !!sellerId,
      debounceMs: 250,
    },
    () => load(),
  );

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
      </p>
    );
  }

  if (!reviews.length) {
    return <p className="py-12 text-center text-xs text-muted-foreground">No reviews yet.</p>;
  }

  const isSeller = !!currentUserId && currentUserId === sellerId;

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          canRespond={isSeller}
          canReport={!!currentUserId}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}
