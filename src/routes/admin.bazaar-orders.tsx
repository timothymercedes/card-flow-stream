import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/bazaar";
import { ORDER_STATUS_LABEL } from "@/lib/bazaarCheckout";
import { approveBazaarFulfillment } from "@/lib/bazaarCheckout.functions";

export const Route = createFileRoute("/admin/bazaar-orders")({
  head: () => ({ meta: [{ title: "PB Bazaar Fulfillment Approval — Admin" }, { name: "description", content: "Review paid PB Bazaar orders and approve fulfillment manually." }, { property: "og:title", content: "PB Bazaar Fulfillment Approval" }, { property: "og:description", content: "Manual approval queue for PB Bazaar orders." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: QueuePage,
});

function QueuePage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const approve = useServerFn(approveBazaarFulfillment);
  const isAdmin = useQuery({ queryKey: ["bz-admin", user?.id], enabled: !!user, queryFn: async () => {
    const [a, o] = await Promise.all([supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" }), supabase.rpc("has_role", { _user_id: user!.id, _role: "owner" })]);
    return !!(a.data || o.data);
  } });
  const queue = useQuery({ queryKey: ["bz-queue"], enabled: isAdmin.data === true, queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_orders").select("id, order_number, status, total_cents, tax_cents, tax_jurisdiction, paid_at, shipping_name, shipping_city, shipping_region, shipping_postal_code, bazaar_order_items(id, title, variant_label, quantity, line_total_cents, bazaar_order_item_fulfillments(status, supplier_variant_ref, supplier_unit_cost_cents, supplier_shipping_cents))").in("status", ["awaiting_fulfillment_approval", "paid_inventory_exception", "fulfillment_authorized"]).order("paid_at", { ascending: true }).limit(200);
    if (error) throw error; return data;
  } });
  const onApprove = async (id: string) => {
    if (!confirm("Approve this order for fulfillment? This only records approval — no supplier order or payment is made.")) return;
    const r = await approve({ data: { orderId: id } });
    if (r.error) toast.error(r.error); else { toast.success("Approved for fulfillment"); void qc.invalidateQueries({ queryKey: ["bz-queue"] }); }
  };
  return <AppShell><div className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-5"><h1 className="text-2xl font-bold">PB Bazaar fulfillment approval</h1>
    <p className="text-sm text-muted-foreground">Approval is manual. Nothing is sent to CJ, no CJ balance is spent and no refunds are issued from this page.</p>
    {loading || isAdmin.isLoading ? <p>Loading…</p> : !user ? <Button asChild><Link to="/auth">Sign in</Link></Button> : !isAdmin.data ? <p role="alert">Admins only.</p>
      : queue.isLoading ? <p>Loading orders…</p> : queue.error ? <p role="alert">Couldn't load orders.</p> : !queue.data?.length ? <p className="text-muted-foreground">No paid orders waiting.</p>
      : <ul className="divide-y divide-border border-t border-border">{queue.data.map((o) => <li key={o.id} className="space-y-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{o.order_number} · {formatCents(o.total_cents)}</p><p className="text-sm text-muted-foreground">{ORDER_STATUS_LABEL[o.status]} · tax {formatCents(o.tax_cents)} ({o.tax_jurisdiction}) · {o.shipping_name}, {o.shipping_city} {o.shipping_region} {o.shipping_postal_code}</p></div>
          {o.status === "awaiting_fulfillment_approval" && <Button onClick={() => void onApprove(o.id)}>Approve fulfillment</Button>}
          {o.status === "paid_inventory_exception" && <span className="text-sm font-semibold text-destructive">Needs manual inventory review</span>}</div>
        <ul className="text-sm">{o.bazaar_order_items.map((i) => { const f = i.bazaar_order_item_fulfillments?.[0]; return <li key={i.id}>{i.title} ({i.variant_label}) ×{i.quantity} — {formatCents(i.line_total_cents)}{f ? ` · CJ ${f.supplier_variant_ref} · cost ${formatCents((f.supplier_unit_cost_cents ?? 0) + (f.supplier_shipping_cents ?? 0))}/unit · ${f.status}` : ""}</li>; })}</ul>
      </li>)}</ul>}
  </div></AppShell>;
}
