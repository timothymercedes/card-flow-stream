import { supabase } from "@/integrations/supabase/client";

/**
 * Shipping address utilities.
 *
 * Reuses the existing `profiles` columns (address_line1/city/state/zip/country)
 * — no parallel "saved_addresses" table. A single source of truth keeps RLS
 * simple and matches what `get_winner_shipping` and the orders snapshot
 * (`ship_*`) already read from.
 *
 * Validation is pragmatic: enough to catch obviously broken/stale addresses
 * before checkout or label generation, without blocking on a paid carrier
 * verification (Shippo lookups can still run server-side at label time).
 */

export type ShippingAddress = {
  full_name?: string | null;
  address_line1?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  phone?: string | null;
};

export type AddressValidation = {
  ok: boolean;
  missing: string[];
  warnings: string[];
};

const REQUIRED: { key: keyof ShippingAddress; label: string }[] = [
  { key: "full_name", label: "Full name" },
  { key: "address_line1", label: "Street address" },
  { key: "address_city", label: "City" },
  { key: "address_zip", label: "Postal / ZIP code" },
  { key: "address_country", label: "Country" },
];

const STATE_REQUIRED_COUNTRIES = new Set(["US", "CA", "AU", "BR", "MX"]);

const PO_BOX_RE = /\b(p\.?\s*o\.?\s*box|post\s*office\s*box)\b/i;

export function validateAddress(a: ShippingAddress | null | undefined): AddressValidation {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!a) return { ok: false, missing: REQUIRED.map((r) => r.label), warnings };

  for (const r of REQUIRED) {
    const v = (a[r.key] ?? "").toString().trim();
    if (!v) missing.push(r.label);
  }

  const country = (a.address_country ?? "").toString().trim().toUpperCase();
  if (country && STATE_REQUIRED_COUNTRIES.has(country) && !(a.address_state ?? "").toString().trim()) {
    missing.push("State / Province");
  }

  if ((a.address_line1 ?? "").toString().match(PO_BOX_RE)) {
    warnings.push("PO Boxes can't accept tracked carrier shipments — use a street address.");
  }

  if (country === "US" && a.address_zip) {
    if (!/^\d{5}(-\d{4})?$/.test(a.address_zip.toString().trim())) {
      warnings.push("US ZIP code looks invalid (expected 5 or 9 digits).");
    }
  }

  if (country && country !== "US" && country.length !== 2) {
    warnings.push(`Country should be a 2-letter code (got "${country}").`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

export function isValidShippingAddress(a: ShippingAddress | null | undefined): boolean {
  return validateAddress(a).ok;
}

/** Save updated shipping address on the user's profile + audit log it. */
export async function saveShippingAddress(userId: string, prev: ShippingAddress | null, next: ShippingAddress): Promise<void> {
  const payload = {
    full_name: next.full_name?.trim() || null,
    address_line1: next.address_line1?.trim() || null,
    address_city: next.address_city?.trim() || null,
    address_state: next.address_state?.trim() || null,
    address_zip: next.address_zip?.trim() || null,
    address_country: (next.address_country?.trim() || "").toUpperCase() || null,
    phone: next.phone?.trim() || null,
  };

  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
  if (error) throw error;

  // Best-effort audit log via the existing log_audit_event RPC.
  try {
    const diff: Record<string, { from: string | null; to: string | null }> = {};
    for (const k of Object.keys(payload) as (keyof typeof payload)[]) {
      const before = ((prev as any)?.[k] ?? null) as string | null;
      const after = (payload as any)[k] as string | null;
      if (before !== after) diff[k] = { from: before, to: after };
    }
    if (Object.keys(diff).length > 0) {
      await (supabase.rpc as any)("log_audit_event", {
        _action: "shipping_address.update",
        _meta: diff,
        _target_id: userId,
        _target_type: "profile",
      });
    }
  } catch {
    /* audit logging is best-effort */
  }
}
