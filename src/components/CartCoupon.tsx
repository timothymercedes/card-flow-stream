import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tag } from "lucide-react";
import { applyStoreCoupon } from "@/lib/coupons.functions";

/** One coupon box per store in the cart; the code only discounts that store's orders. */
export function CartCoupon({ orderIds, applied, onApplied }: { orderIds: string[]; applied: boolean; onApplied: () => void }) {
  const redeem = useServerFn(applyStoreCoupon);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  if (applied) return <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-primary"><Tag className="h-3 w-3" />Store coupon applied</p>;
  const apply = async () => {
    setBusy(true); setMsg(undefined);
    let r: { error?: string; discount?: number };
    try { r = await redeem({ data: { orderIds, code } }); } catch (e) { r = { error: e instanceof Error ? e.message : "Could not apply code" }; }
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: `Saved $${Number(r.discount).toFixed(2)}` }); setCode(""); onApplied();
  };
  return <div className="mt-2 rounded-lg border border-border p-2">
    <div className="flex gap-2">
      <input aria-label="Store coupon code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="Store coupon code" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs uppercase" />
      <button type="button" onClick={() => void apply()} disabled={busy || code.length < 3} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy ? "…" : "Apply"}</button>
    </div>
    {msg && <p role="status" className={`mt-1 text-[11px] ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
  </div>;
}
