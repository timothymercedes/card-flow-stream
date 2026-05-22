import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ClaimForm } from "@/components/insurance/ClaimForm";
import { InsuredBadge } from "@/components/insurance/InsuredBadge";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/seller/insurance")({ component: SellerInsurance });

function SellerInsurance() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [openOrder, setOpenOrder] = useState<any | null>(null);

  async function load() {
    if (!user) return;
    const { data: o } = await supabase.from("orders")
      .select("id, title, amount, insurance_status, insurance_provider, insurance_coverage_cents, insurance_fee_cents, insurance_paid_by, insurance_added_post_purchase, shipping_status, created_at")
      .eq("seller_id", user.id)
      .neq("insurance_status", "none")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders(o ?? []);
    const { data: c } = await supabase.from("insurance_claims" as any)
      .select("id, order_id, reason, status, claim_amount_cents, reimbursed_cents, created_at, admin_notes")
      .eq("claimant_user_id", user.id)
      .order("created_at", { ascending: false }).limit(100);
    setClaims((c ?? []) as any);
  }
  useEffect(() => { load(); }, [user]);

  const eligibleStatuses = new Set(["delivery_failed", "lost_package", "returned", "delivered", "in_transit"]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-extrabold">Shipping Insurance</h1>
        </div>

        <h2 className="mb-2 text-sm font-bold text-muted-foreground">Insured orders</h2>
        <div className="space-y-2">
          {orders.length === 0 && (
            <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No insured orders yet.</p>
          )}
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold">{o.title}</p>
                    <InsuredBadge provider={o.insurance_provider} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Coverage ${((o.insurance_coverage_cents ?? 0) / 100).toFixed(2)} · Fee ${((o.insurance_fee_cents ?? 0) / 100).toFixed(2)} ·{" "}
                    Paid by {o.insurance_paid_by ?? "—"}
                    {o.insurance_added_post_purchase && " · Post-purchase"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Status: <span className="font-semibold">{o.insurance_status}</span> · Shipping: {o.shipping_status ?? "—"}
                  </p>
                </div>
                {eligibleStatuses.has(o.shipping_status) && o.insurance_status !== "claim_pending" && o.insurance_status !== "claim_approved" && (
                  <button
                    onClick={() => setOpenOrder(o)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                  >
                    File claim
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <h2 className="mb-2 mt-6 text-sm font-bold text-muted-foreground">My claims</h2>
        <div className="space-y-2">
          {claims.length === 0 && <p className="text-xs text-muted-foreground">No claims filed.</p>}
          {claims.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold capitalize">{c.reason}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase">{c.status}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Claim ${(c.claim_amount_cents / 100).toFixed(2)}
                {c.reimbursed_cents > 0 && <> · Reimbursed ${(c.reimbursed_cents / 100).toFixed(2)}</>}
              </p>
              {c.admin_notes && <p className="mt-1 italic text-muted-foreground">"{c.admin_notes}"</p>}
            </div>
          ))}
        </div>

        {openOrder && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpenOrder(null)}>
            <div className="w-full max-w-md rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <ClaimForm
                orderId={openOrder.id}
                maxCoverageCents={openOrder.insurance_coverage_cents ?? 0}
                onClose={() => setOpenOrder(null)}
                onSubmitted={() => { setOpenOrder(null); load(); }}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
