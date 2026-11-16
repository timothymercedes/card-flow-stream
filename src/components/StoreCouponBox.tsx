import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tag } from "lucide-react";
import { applyStoreCoupon } from "@/lib/coupons.functions";

/** Coupon entry for one store's items in the cart; the server only discounts that store's orders. */
export function StoreCouponBox({ orderIds, applied, onApplied }: { orderIds: string[]; applied: boolean; onApplied: () => void }) {
  const redeem = useServerFn(applyStoreCoupon);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  if (applied) return <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-primary"><Tag className="h-3.5 w-3.5" />Store coupon applied to this store's items</p>;
  const apply = async () => {
    if (!code) return;
    setBusy(true); setMsg(undefined);
    try {
      const r = await redeem({ data: { orderIds, code } });
      if ("error" in r && r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: `Saved $${Number(r.discount).toFixed(2)}` }); setCode(""); onApplied(); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not apply code" }); }
    setBusy(false);
  };
  return <div className="mt-2">
    <div className="flex gap-2">
      <input aria-label="Store coupon code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="Coupon for this store" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs uppercase" />
      <button type="button" onClick={() => void apply()} disabled={busy || !code} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy ? "…" : "Apply"}</button>
    </div>
    {msg && <p role="status" className={`mt-1 text-[11px] ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
  </div>;
}
