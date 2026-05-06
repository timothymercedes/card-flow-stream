import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

type Req = {
  id: string;
  username: string;
  avatar_url: string | null;
  verification_status: string;
  verification_requested_at: string | null;
  verification_reason: string | null;
  seller_status: string;
  live_verified: boolean;
  verified_at: string | null;
  report_count: number;
  created_at: string;
};

export function VerificationInbox() {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_list_verification_requests", { _limit: 100 });
    if (error) toast.error(error.message);
    setItems((data as Req[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-verifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function setStatus(u: Req, status: "approved" | "denied" | "reverify_required") {
    const reason = status === "approved" ? null
      : window.prompt(status === "denied" ? "Reason for denial?" : "Reason for re-verification?") || "";
    if (status !== "approved" && !reason) return;
    setBusy(u.id);
    const { error } = await (supabase.rpc as any)("admin_set_verification_status", {
      _target_user: u.id, _status: status, _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? `Approved @${u.username}` : status === "denied" ? `Denied @${u.username}` : `Re-verify required for @${u.username}`);
    load();
  }

  if (loading) return <p className="py-12 text-center text-xs text-muted-foreground">Loading…</p>;
  if (items.length === 0) return (
    <div className="rounded-xl bg-card p-8 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-bold">No verification requests</p>
      <p className="mt-1 text-xs text-muted-foreground">New seller and host applications will appear here in real time.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{items.length} pending</p>
      {items.map((u) => (
        <div key={u.id} className="rounded-xl bg-card p-3">
          <div className="flex items-center gap-2">
            {u.avatar_url ? <img src={u.avatar_url} className="h-9 w-9 rounded-full object-cover" alt="" /> : <div className="h-9 w-9 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">@{u.username}</p>
              <p className="text-[10px] text-muted-foreground">
                Requested {u.verification_requested_at ? new Date(u.verification_requested_at).toLocaleString() : "—"}
                {" · "}Seller: {u.seller_status}{u.live_verified ? " · Live ✓" : ""}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${u.verification_status === "reverify_required" ? "bg-amber-500/20 text-amber-500" : "bg-primary/20 text-primary"}`}>
              {u.verification_status}
            </span>
          </div>
          {u.verification_reason && (
            <p className="mt-1.5 rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap">{u.verification_reason}</p>
          )}
          {u.report_count > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
              <AlertTriangle className="h-3 w-3" /> {u.report_count} report{u.report_count === 1 ? "" : "s"} on this account
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button disabled={busy === u.id} onClick={() => setStatus(u, "approved")}
              className="rounded-lg bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50">Approve</button>
            <button disabled={busy === u.id} onClick={() => setStatus(u, "denied")}
              className="rounded-lg bg-destructive/20 px-3 py-1 text-[10px] font-bold text-destructive disabled:opacity-50">Deny</button>
            <button disabled={busy === u.id} onClick={() => setStatus(u, "reverify_required")}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-3 py-1 text-[10px] font-bold text-amber-500 disabled:opacity-50">
              <RefreshCw className="h-3 w-3" /> Force re-verify
            </button>
            <button
              disabled={busy === u.id}
              onClick={async () => {
                const reason = window.prompt("Reason for forcing seller agreement re-acceptance?") || "";
                if (!reason) return;
                setBusy(u.id);
                const { error } = await (supabase.rpc as any)("admin_force_seller_reaccept", { _target_user: u.id, _reason: reason });
                setBusy(null);
                if (error) return toast.error(error.message);
                toast.success(`@${u.username} must re-accept the Seller Agreement`);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-500/15 px-3 py-1 text-[10px] font-bold text-fuchsia-400 disabled:opacity-50"
            >
              📝 Force re-accept agreement
            </button>
            <a href={`/seller/${u.username}`} target="_blank" rel="noreferrer"
              className="rounded-lg bg-muted px-3 py-1 text-[10px] font-bold">View profile</a>
          </div>
        </div>
      ))}
    </div>
  );
}
