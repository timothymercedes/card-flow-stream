import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";

export function DeleteAccountSection() {
  const navigate = useNavigate();
  const runDelete = useServerFn(deleteMyAccount);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (confirm !== "DELETE" || busy) return;
    setBusy(true);
    try {
      const res = await runDelete({ data: { confirm: "DELETE" } });
      if (!res?.success) {
        toast.error(res?.error ?? "Failed to delete account.");
        setBusy(false);
        return;
      }
      toast.success("Your account has been permanently deleted.");
      await supabase.auth.signOut();
      navigate({ to: "/" });
      // Hard reload to clear any cached state.
      setTimeout(() => window.location.assign("/"), 300);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete account.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-bold text-destructive">Delete account</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently delete your account and personal data. This cannot be
            undone. Active listings, bids, posts and your profile will be removed.
          </p>
        </div>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-destructive/40 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-3 rounded-lg bg-card p-3">
          <p className="text-xs text-muted-foreground">
            Type <span className="font-bold text-foreground">DELETE</span> to
            confirm. This action is immediate and irreversible.
          </p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoFocus
            className="w-full rounded-lg bg-input px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={confirm !== "DELETE" || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirm("");
              }}
              disabled={busy}
              className="rounded-lg bg-muted px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
