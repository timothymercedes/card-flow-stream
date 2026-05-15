import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ShippingAddress, saveShippingAddress, validateAddress } from "@/lib/address";
import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { toast } from "sonner";

/**
 * ShippingAddressForm — reusable inline form to view, validate, and save the
 * signed-in user's default shipping address. Reads/writes the same `profiles`
 * columns the rest of the platform already uses (orders snapshot, payouts,
 * winner shipping RPC). Calls `saveShippingAddress` which also writes an
 * audit log entry on every change.
 *
 * Mount it inline in checkout (block until valid) or in settings (manage).
 */
export function ShippingAddressForm({
  onSaved,
  compact,
}: {
  onSaved?: (addr: ShippingAddress) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prev, setPrev] = useState<ShippingAddress | null>(null);
  const [a, setA] = useState<ShippingAddress>({
    full_name: "", address_line1: "", address_city: "",
    address_state: "", address_zip: "", address_country: "US", phone: "",
  });

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase.from("profiles")
      .select("full_name,address_line1,address_city,address_state,address_zip,address_country,phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const next = {
            full_name: data.full_name ?? "",
            address_line1: data.address_line1 ?? "",
            address_city: data.address_city ?? "",
            address_state: data.address_state ?? "",
            address_zip: data.address_zip ?? "",
            address_country: (data.address_country ?? "US").toUpperCase(),
            phone: (data as any).phone ?? "",
          };
          setA(next);
          setPrev(next);
        }
        setLoading(false);
      });
  }, [user]);

  const v = validateAddress(a);

  async function save() {
    if (!user) return;
    if (!v.ok) {
      toast.error(`Missing: ${v.missing.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      await saveShippingAddress(user.id, prev, a);
      setPrev(a);
      toast.success("Shipping address saved");
      onSaved?.(a);
    } catch (e: any) {
      toast.error(e.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">Loading address…</div>;

  return (
    <div className={`space-y-2.5 ${compact ? "" : "rounded-xl border border-border bg-card p-4"}`}>
      {!compact && (
        <div className="flex items-center gap-2 pb-1">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-sm font-bold">Shipping address</p>
          {v.ok && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" aria-label="Valid" />}
        </div>
      )}

      <Field label="Full name" v={a.full_name ?? ""} on={(x) => setA({ ...a, full_name: x })} />
      <Field label="Street address" v={a.address_line1 ?? ""} on={(x) => setA({ ...a, address_line1: x })} placeholder="123 Main St, Apt 4" />
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" v={a.address_city ?? ""} on={(x) => setA({ ...a, address_city: x })} />
        <Field label="State / Province" v={a.address_state ?? ""} on={(x) => setA({ ...a, address_state: x })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="ZIP / Postal code" v={a.address_zip ?? ""} on={(x) => setA({ ...a, address_zip: x })} />
        <Field label="Country (2-letter)" v={a.address_country ?? ""} on={(x) => setA({ ...a, address_country: x.toUpperCase() })} maxLength={2} />
      </div>
      <Field label="Phone (optional)" v={a.phone ?? ""} on={(x) => setA({ ...a, phone: x })} placeholder="+1 555 123 4567" />

      {v.missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Missing: {v.missing.join(", ")}</span>
        </div>
      )}
      {v.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{w}</span>
        </div>
      ))}

      <button
        onClick={save}
        disabled={saving || !v.ok}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save shipping address"}
      </button>
    </div>
  );
}

function Field({ label, v, on, placeholder, maxLength }: { label: string; v: string; on: (x: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={v}
        onChange={(e) => on(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-lg bg-input px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-primary"
      />
    </label>
  );
}
