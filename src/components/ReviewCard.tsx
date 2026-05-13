/**
 * ReviewCard — rich review row with sub-ratings, verified badges,
 * seller/buyer response thread, and a Respond composer for the seller.
 *
 * - `canRespond` = true when the current user is the seller being reviewed.
 * - `canReport`  = true when the current user can flag this review.
 *
 * Mutations write to `review_responses` / `review_reports`. RLS enforces
 * who can insert which rows; this component only gates the *UI*.
 */
import { useState } from "react";
import { Star, BadgeCheck, Radio, Flag, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UsernamePopover } from "@/components/UsernamePopover";

export type ReviewRow = {
  id: string;
  buyer_id: string;
  buyer_username: string;
  rating: number;
  shipping_rating: number | null;
  communication_rating: number | null;
  accuracy_rating: number | null;
  comment: string | null;
  photo_urls: string[] | null;
  verified_purchase: boolean;
  verified_live_auction: boolean;
  created_at: string;
  seller_response?: { body: string; created_at: string } | null;
  buyer_response?: { body: string; created_at: string } | null;
};

function Stars({ n, size = 12 }: { n: number | null | undefined; size?: number }) {
  const v = Number(n ?? 0);
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(v) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review,
  canRespond = false,
  canReport = false,
  currentUserId,
}: {
  review: ReviewRow;
  canRespond?: boolean;
  canReport?: boolean;
  currentUserId?: string | null;
}) {
  const [showRespond, setShowRespond] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [localSellerResp, setLocalSellerResp] = useState(review.seller_response ?? null);

  const canBuyerReply = !!currentUserId && currentUserId === review.buyer_id && !!localSellerResp && !review.buyer_response;

  async function submitResponse(role: "seller" | "buyer") {
    if (!body.trim() || !currentUserId) return;
    setSubmitting(true);
    const { error } = await supabase.from("review_responses").insert({
      review_id: review.id,
      author_id: currentUserId,
      author_role: role,
      body: body.trim().slice(0, 2000),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    if (role === "seller") setLocalSellerResp({ body: body.trim(), created_at: new Date().toISOString() });
    toast.success("Response posted");
    setBody("");
    setShowRespond(false);
  }

  async function reportReview() {
    if (!currentUserId) { toast.error("Sign in to report"); return; }
    const reason = window.prompt("Why are you reporting this review?\n(spam, harassment, false claim, off-topic, other)");
    if (!reason) return;
    setReporting(true);
    const { error } = await supabase.from("review_reports").insert({
      review_id: review.id,
      reporter_id: currentUserId,
      reason: reason.trim().slice(0, 200),
    });
    setReporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report submitted to moderators");
  }

  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border/40">
      <div className="flex items-center justify-between gap-2">
        <UsernamePopover username={review.buyer_username} className="min-w-0">
          <p className="truncate text-xs font-semibold">@{review.buyer_username}</p>
        </UsernamePopover>
        <Stars n={review.rating} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        {review.verified_purchase && (
          <span className="inline-flex items-center gap-0.5 text-emerald-400">
            <BadgeCheck className="h-3 w-3" /> Verified purchase
          </span>
        )}
        {review.verified_live_auction && (
          <span className="inline-flex items-center gap-0.5 text-fuchsia-400">
            <Radio className="h-3 w-3" /> Live auction win
          </span>
        )}
        <span>· {new Date(review.created_at).toLocaleDateString()}</span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">📦 <Stars n={review.shipping_rating} size={10} /></span>
        {review.communication_rating != null && (
          <span className="inline-flex items-center gap-1">💬 <Stars n={review.communication_rating} size={10} /></span>
        )}
        {review.accuracy_rating != null && (
          <span className="inline-flex items-center gap-1">🎯 <Stars n={review.accuracy_rating} size={10} /></span>
        )}
      </div>

      {review.comment && <p className="mt-1.5 text-xs">{review.comment}</p>}

      {!!review.photo_urls?.length && (
        <div className="mt-1.5 flex gap-1 overflow-x-auto">
          {review.photo_urls.slice(0, 4).map((u, i) => (
            <img key={i} src={u} alt="review photo" className="h-14 w-14 rounded-md object-cover ring-1 ring-border/40" loading="lazy" />
          ))}
        </div>
      )}

      {localSellerResp && (
        <div className="mt-2 rounded-lg bg-primary/5 p-2 ring-1 ring-primary/20">
          <p className="text-[10px] font-semibold text-primary">Seller response</p>
          <p className="mt-0.5 text-xs">{localSellerResp.body}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(localSellerResp.created_at).toLocaleDateString()}</p>
        </div>
      )}

      {review.buyer_response && (
        <div className="mt-2 rounded-lg bg-muted/40 p-2">
          <p className="text-[10px] font-semibold">@{review.buyer_username} replied</p>
          <p className="mt-0.5 text-xs">{review.buyer_response.body}</p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {canRespond && !localSellerResp && (
          <button
            type="button"
            onClick={() => setShowRespond((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
          >
            <MessageSquare className="h-3 w-3" /> Respond
          </button>
        )}
        {canBuyerReply && (
          <button
            type="button"
            onClick={() => setShowRespond((s) => !s)}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold"
          >
            <MessageSquare className="h-3 w-3" /> Reply
          </button>
        )}
        {canReport && currentUserId && currentUserId !== review.buyer_id && (
          <button
            type="button"
            onClick={reportReview}
            disabled={reporting}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive"
          >
            <Flag className="h-3 w-3" /> Report
          </button>
        )}
      </div>

      {showRespond && (
        <div className="mt-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Write a professional, public response…"
            className="w-full resize-none rounded-md bg-background p-2 text-xs ring-1 ring-border focus:outline-none focus:ring-primary"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => { setShowRespond(false); setBody(""); }}
              className="rounded-md px-2 py-1 text-[10px] text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || !body.trim()}
              onClick={() => submitResponse(canRespond ? "seller" : "buyer")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />} Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
