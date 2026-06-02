import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { adminListClaims, adminDecideClaim, getEvidenceSignedUrl } from "@/lib/insurance.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/insurance-claims")({ component: AdminInsuranceClaims });

function AdminInsuranceClaims() {
  const list = useServerFn(adminListClaims);
  const decide = useServerFn(adminDecideClaim);
  const sign = useServerFn(getEvidenceSignedUrl);
  const [filter, setFilter] = useState<"submitted" | "under_review" | "approved" | "denied" | "paid" | "all">("submitted");
  const [claims, setClaims] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [reimburse, setReimburse] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await list({ data: { status: filter } });
      setClaims(res.claims);
      setCounts(res.recentCountsBySeller);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [filter]);

  async function openClaim(c: any) {
    setOpenId(c.id);
    setNotes(c.admin_notes ?? "");
    setReimburse(((c.claim_amount_cents ?? 0) / 100).toFixed(2));
    const { data } = await supabase.from("insurance_claim_evidence" as any)
      .select("id, file_path, kind, notes").eq("claim_id", c.id);
    setEvidence((data ?? []) as any);
  }

  async function viewFile(path: string) {
    try {
      const { url } = await sign({ data: { filePath: path } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e?.message || "Could not open file"); }
  }

  async function act(decision: "approved" | "denied" | "paid" | "under_review") {
    if (!openId) return;
    try {
      await decide({
        data: {
          claimId: openId, decision, notes,
          reimbursedCents: Math.round(parseFloat(reimburse || "0") * 100),
        },
      });
      toast.success(`Marked ${decision}`);
      setOpenId(null);
      load();
    } catch (e: any) { toast.error(e?.message || "Action failed"); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-extrabold">Insurance Claims</h1>
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          {(["submitted", "under_review", "approved", "denied", "paid", "all"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >{s.replace("_", " ")}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {claims.length === 0 && <p className="text-sm text-muted-foreground">No claims.</p>}
            {claims.map((c) => (
              <button key={c.id} onClick={() => openClaim(c)}
                className="w-full rounded-xl border border-border bg-card p-3 text-left hover:bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold capitalize">{c.reason}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{c.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Order {String(c.order_id).slice(0, 8)} · ${(c.claim_amount_cents / 100).toFixed(2)} via {c.provider_code ?? "—"}
                </p>
                {counts[c.claimant_user_id] >= 3 && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> {counts[c.claimant_user_id]} claims in 90d
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {openId && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpenId(null)}>
            <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold">Decide claim</h2>

              <div>
                <p className="mb-1 text-xs font-semibold">Evidence ({evidence.length})</p>
                <div className="space-y-1">
                  {evidence.map((e) => (
                    <button key={e.id} onClick={() => viewFile(e.file_path)}
                      className="block w-full truncate rounded-lg border border-border px-2 py-1.5 text-left text-xs hover:bg-muted/30">
                      📎 {e.file_path.split("/").pop()}
                    </button>
                  ))}
                  {evidence.length === 0 && <p className="text-xs text-muted-foreground">No files</p>}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Admin notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">Reimbursement (USD)</label>
                <input type="number" step="0.01" value={reimburse} onChange={(e) => setReimburse(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => act("under_review")} className="rounded-lg bg-muted py-2 text-xs font-bold">Under review</button>
                <button onClick={() => act("denied")} className="rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground">Deny</button>
                <button onClick={() => act("approved")} className="rounded-lg bg-amber-500 py-2 text-xs font-bold text-white">Approve</button>
                <button onClick={() => act("paid")} className="rounded-lg bg-green-600 py-2 text-xs font-bold text-white">Mark paid</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
