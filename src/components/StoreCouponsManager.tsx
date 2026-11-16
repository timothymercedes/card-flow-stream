import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Ticket } from "lucide-react";

export function StoreCouponsManager({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const key = ["store-coupons", sellerId];
  const { data: coupons = [] } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("store_coupons").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ code: "", kind: "percent", value: "10", min: "", max: "", expires: "" });
  const [msg, setMsg] = useState<string>();
  const save = async () => {
    setMsg(undefined);
    if (!/^[A-Z0-9]{3,20}$/.test(f.code)) return setMsg("Code must be 3–20 letters or numbers.");
    const value = Number(f.value);
    if (!(value > 0) || (f.kind === "percent" && value > 90)) return setMsg(f.kind === "percent" ? "Percent must be 1–90." : "Amount must be above $0.");
    const { error } = await supabase.from("store_coupons").insert({ seller_id: sellerId, code: f.code, kind: f.kind, value, min_subtotal: Number(f.min || 0), max_uses: f.max ? Number(f.max) : null, expires_at: f.expires ? new Date(f.expires + "T23:59:59").toISOString() : null });
    if (error) return setMsg(error.message.includes("duplicate") ? "You already have that code." : error.message);
    setF({ ...f, code: "" }); setMsg("Coupon created!"); void qc.invalidateQueries({ queryKey: key });
  };
  const toggle = async (id: string, active: boolean) => { await supabase.from("store_coupons").update({ active }).eq("id", id); void qc.invalidateQueries({ queryKey: key }); };
  const inp = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
  return <section className="mt-6 rounded-2xl border border-border bg-card p-4">
    <h2 className="mb-1 flex items-center gap-2 font-black"><Ticket className="h-5 w-5 text-primary" />Store coupons</h2>
    <p className="mb-3 text-xs text-muted-foreground">Buyers type the code at checkout. You cover the discount, and shipping is never discounted.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <input aria-label="Code" placeholder="CODE e.g. SAVE10" value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} className={inp} />
      <select aria-label="Type" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} className={inp}><option value="percent">% off</option><option value="amount">$ off</option></select>
      <input aria-label="Discount" type="number" min="1" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} className={inp} />
      <input aria-label="Minimum spend" type="number" min="0" placeholder="Min spend $ (optional)" value={f.min} onChange={e => setF({ ...f, min: e.target.value })} className={inp} />
      <input aria-label="Max uses" type="number" min="1" placeholder="Max uses (optional)" value={f.max} onChange={e => setF({ ...f, max: e.target.value })} className={inp} />
      <input aria-label="Expires" type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} className={inp} />
    </div>
    <div className="mt-2 flex items-center gap-3"><button type="button" onClick={() => void save()} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Create coupon</button>{msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}</div>
    {coupons.length > 0 && <ul className="mt-4 divide-y divide-border">{coupons.map((c: any) => <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0"><b className="font-mono">{c.code}</b> · {c.kind === "percent" ? `${Number(c.value)}% off` : `$${Number(c.value).toFixed(2)} off`}
        <div className="truncate text-xs text-muted-foreground">Used {c.uses}{c.max_uses ? `/${c.max_uses}` : ""}{Number(c.min_subtotal) > 0 ? ` · min $${Number(c.min_subtotal)}` : ""}{c.expires_at ? ` · ends ${new Date(c.expires_at).toLocaleDateString()}` : ""}</div></div>
      <button type="button" aria-label={`Turn ${c.code} ${c.active ? "off" : "on"}`} onClick={() => void toggle(c.id, !c.active)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${c.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c.active ? "On" : "Off"}</button>
    </li>)}</ul>}
  </section>;
}
