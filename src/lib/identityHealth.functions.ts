// Phase D — Master card-identity health monitor.
//
// Read-only, admin-gated snapshot of the master identity database so we can
// catch the failure modes that erode collector trust BEFORE they spread:
//   - legacy_format_count: rows whose fingerprint isn't the runtime 32-hex
//     format (e.g. the "bf_" backfill) — these can never be matched on rescan
//     and WILL spawn a duplicate identity.
//   - duplicate_extra_rows / duplicate_groups: the same card information that
//     resolved to more than one master row.
//   - provider_key_collisions: one market-data key pointing at >1 identity.
//   - orphan_vault_cards: vault cards not yet linked to a master identity.
//   - bad_language_codes: identities with a non-canonical language code.
//
// This never mutates anything — it powers an admin dashboard / alerting and the
// validation harness. Master identity = card INFORMATION; pricing is untouched.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface IdentityHealth {
  total_identities: number;
  legacy_format_count: number;
  duplicate_extra_rows: number;
  duplicate_groups: number;
  provider_key_collisions: number;
  orphan_vault_cards: number;
  bad_language_codes: number;
  duplicate_samples: Array<{
    category: string;
    name: string;
    set: string | null;
    number: string | null;
    language: string | null;
    copies: number;
    ids: string[];
  }>;
  generated_at: string;
}

export const getIdentityHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("admin_identity_health" as never);
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as IdentityHealth | null;
  });
