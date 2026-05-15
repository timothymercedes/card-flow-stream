import { useEffect, useState } from "react";
import { X, Bug, Lightbulb, Sparkles, MessageSquare } from "lucide-react";

export const FEEDBACK_OPEN_EVENT = "pullbid:open-feedback";
export function openFeedback() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FEEDBACK_OPEN_EVENT));
}
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";

type Category = "bug" | "idea" | "praise" | "other";

const CATS: { k: Category; label: string; icon: any; cls: string }[] = [
  { k: "bug", label: "Bug", icon: Bug, cls: "bg-red-500/15 text-red-400 ring-red-500/30" },
  { k: "idea", label: "Idea", icon: Lightbulb, cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30" },
  { k: "praise", label: "Praise", icon: Sparkles, cls: "bg-primary/15 text-primary ring-primary/30" },
  { k: "other", label: "Other", icon: MessageSquare, cls: "bg-muted text-muted-foreground ring-border" },
];

export function FeedbackWidget() {
  const { user } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  async function submit() {
    if (message.trim().length < 3) {
      toast.error("Please add a few more details.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("beta_feedback").insert({
      user_id: user!.id,
      category,
      message: message.trim(),
      page_path: loc.pathname,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't send feedback. Try again.");
      return;
    }
    toast.success("Thanks — we read every note.");
    setMessage("");
    setOpen(false);
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Send beta feedback"
          className="fixed bottom-[10.5rem] right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-card text-primary shadow-lg ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <MessageCircleHeart className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-background p-4 shadow-2xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Send feedback</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              {CATS.map((c) => {
                const Icon = c.icon;
                const active = category === c.k;
                return (
                  <button
                    key={c.k}
                    onClick={() => setCategory(c.k)}
                    className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-bold ring-1 transition-colors ${active ? c.cls : "bg-card text-muted-foreground ring-border"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder={category === "bug" ? "What broke? What did you expect?" : category === "idea" ? "What would make PullBidLive better?" : "Tell us more…"}
              className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />

            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Page: {loc.pathname}</span>
              <span>{message.length}/4000</span>
            </div>

            <button
              onClick={submit}
              disabled={submitting || message.trim().length < 3}
              className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
