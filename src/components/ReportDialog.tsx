import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type TargetType = "user" | "order" | "message" | "stream" | "post" | "listing";

const CATEGORIES: Record<TargetType, { value: string; label: string }[]> = {
  user: [
    { value: "harassment", label: "Harassment / abuse" },
    { value: "scam", label: "Scam / fraud" },
    { value: "impersonation", label: "Impersonation" },
    { value: "other", label: "Other" },
  ],
  order: [
    { value: "not_received", label: "Item not received" },
    { value: "not_as_described", label: "Not as described" },
    { value: "damaged", label: "Arrived damaged" },
    { value: "fake", label: "Counterfeit / fake" },
    { value: "other", label: "Other" },
  ],
  message: [
    { value: "harassment", label: "Harassment / threats" },
    { value: "spam", label: "Spam" },
    { value: "scam", label: "Scam attempt" },
    { value: "other", label: "Other" },
  ],
  stream: [
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "scam", label: "Scam" },
    { value: "other", label: "Other" },
  ],
  post: [
    { value: "inappropriate", label: "Inappropriate" },
    { value: "spam", label: "Spam" },
    { value: "other", label: "Other" },
  ],
  listing: [
    { value: "fake", label: "Counterfeit" },
    { value: "misleading", label: "Misleading" },
    { value: "prohibited", label: "Prohibited item" },
    { value: "other", label: "Other" },
  ],
};

export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  trigger,
  size = "sm",
}: {
  targetType: TargetType;
  targetId?: string | null;
  targetLabel?: string;
  trigger?: React.ReactNode;
  size?: "sm" | "icon";
}) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[targetType][0].value);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!user || !profile) return toast.error("Sign in to report");
    if (!reason.trim() || reason.trim().length < 10) return toast.error("Please add at least 10 characters describing the issue");
    setSubmitting(true);
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: user.id,
      reporter_username: profile.username,
      target_type: targetType,
      target_id: targetId || null,
      target_label: targetLabel || null,
      category,
      reason: reason.trim().slice(0, 1000),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setOpen(false);
    setReason("");
    toast.success("Report submitted — our team will review it");
  }

  const defaultTrigger =
    size === "icon" ? (
      <button className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Report">
        <Flag className="h-4 w-4" />
      </button>
    ) : (
      <button className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        <Flag className="h-3 w-3" /> Report
      </button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4" /> Report {targetType}
          </DialogTitle>
        </DialogHeader>
        {targetLabel && <p className="truncate text-xs text-muted-foreground">{targetLabel}</p>}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Reason</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            >
              {CATEGORIES[targetType].map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Details</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              rows={4}
              placeholder="What happened? Add as much detail as possible."
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{reason.length}/1000</p>
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
