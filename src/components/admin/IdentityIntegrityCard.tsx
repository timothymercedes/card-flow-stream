import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function IdentityIntegrityCard({ userId }: { userId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const [h, i, p] = await Promise.all([
      supabase.from("username_history").select("*").eq("user_id", userId).order("changed_at", { ascending: false }),
      supabase.from("account_investigations").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    ]);
    setHistory(h.data || []); setInv(i.data || []); setCreated(p.data?.created_at ?? null);
  }
  useEffect(() => { void load(); }, [userId]);

  async function open() {
    if (!reason.trim()) return toast.error("Add a reason");
    const { error } = await supabase.from("account_investigations").insert({ user_id: userId, reason: reason.trim() });
    if (error) toast.error(error.message); else { setReason(""); toast.success("Investigation opened"); }
    void load();
  }
  async function close(id: string) {
    const notes = prompt("Closing notes (required)");
    if (!notes) return;
    const { error } = await supabase.from("account_investigations").update({ status: "closed", closing_notes: notes }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Closed — 60-day username lock started");
    void load();
  }
  async function override(id: string) {
    const r = prompt("Override reason (lifts username lock)");
    if (!r) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("account_investigations").update({ override_reason: r, override_at: new Date().toISOString(), override_by: u.user?.id }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Lock overridden");
    void load();
  }

  return (
    <section className="mt-3 rounded-lg border border-border p-3 text-xs space-y-3">
      <h4 className="font-semibold text-sm">Identity & integrity</h4>
      <div className="grid gap-1 sm:grid-cols-2">
        <p><span className="text-muted-foreground">Permanent ID:</span> <code className="break-all">{userId}</code></p>
        <p><span className="text-muted-foreground">Account created:</span> {created ? new Date(created).toLocaleString() : "—"}</p>
      </div>
      <div>
        <p className="font-semibold mb-1">Username history</p>
        {history.length === 0 ? <p className="text-muted-foreground">No changes.</p> : history.map((h) => (
          <p key={h.id}>@{h.old_username ?? "—"} → @{h.new_username} · {new Date(h.changed_at).toLocaleDateString()} · <span className="uppercase text-muted-foreground">{h.initiator_type}</span>{h.reason ? ` · ${h.reason}` : ""}</p>
        ))}
      </div>
      <div>
        <p className="font-semibold mb-1">Investigations</p>
        {inv.length === 0 && <p className="text-muted-foreground">None.</p>}
        {inv.map((i) => {
          const locked = i.status === "closed" && !i.override_at && i.earliest_permitted_change_at && new Date(i.earliest_permitted_change_at) > new Date();
          return (
            <div key={i.id} className="rounded border border-border p-2 mb-1">
              <p><b className={i.status === "active" ? "text-destructive" : ""}>{i.status.toUpperCase()}</b> · {i.reason} · opened {new Date(i.restriction_start).toLocaleDateString()}</p>
              {i.closed_at && <p className="text-muted-foreground">Closed {new Date(i.closed_at).toLocaleDateString()}{i.closing_notes ? ` — ${i.closing_notes}` : ""}</p>}
              {locked && <p>Username lock until {new Date(i.earliest_permitted_change_at).toLocaleDateString()}</p>}
              {i.override_at && <p className="text-muted-foreground">Overridden: {i.override_reason}</p>}
              <div className="mt-1 flex gap-2">
                {i.status === "active" && <button onClick={() => close(i.id)} className="rounded bg-secondary px-2 py-1">Close</button>}
                {(i.status === "active" || locked) && <button onClick={() => override(i.id)} className="rounded bg-secondary px-2 py-1">Override lock</button>}
              </div>
            </div>
          );
        })}
        <div className="mt-2 flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for investigation" className="flex-1 rounded border border-input bg-background px-2 py-1" />
          <button onClick={open} className="rounded bg-primary px-3 py-1 text-primary-foreground">Open</button>
        </div>
      </div>
    </section>
  );
}
