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

// Canonical language codes the runtime fingerprint accepts. Anything else is a
// data-health problem (e.g. the legacy "auto" backfill artifact) that must be
// normalized, because it changes the fingerprint and can spawn duplicates.
const VALID_LANG_CODES = ["en", "jp", "zh", "ko", "fr", "de", "es", "it", "pt"];

export interface IdentityAuditRow {
  id: string;
  category: string;
  name: string;
  set: string | null;
  number: string | null;
  language: string | null;
  fingerprint: string;
}

export interface DuplicateFingerprintGroup {
  fingerprint: string;
  copies: number;
  rows: IdentityAuditRow[];
}

export interface IdentityAudit {
  total_identities: number;
  duplicate_fingerprint_groups: DuplicateFingerprintGroup[];
  invalid_language_rows: IdentityAuditRow[];
  generated_at: string;
}

// Admin-only deep audit: lists every remaining duplicate-fingerprint group and
// every identity whose language code is non-canonical, so data health can be
// verified at a glance. Read-only — never mutates.
export const getIdentityAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IdentityAudit> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    } as never);
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("card_identities")
      .select("id, category, name, set_name, set_code, number, language, fingerprint");
    if (error) throw new Error(error.message);

    const all = (data ?? []) as Array<{
      id: string; category: string; name: string;
      set_name: string | null; set_code: string | null;
      number: string | null; language: string | null; fingerprint: string;
    }>;

    const toRow = (r: (typeof all)[number]): IdentityAuditRow => ({
      id: r.id,
      category: r.category,
      name: r.name,
      set: r.set_code || r.set_name,
      number: r.number,
      language: r.language,
      fingerprint: r.fingerprint,
    });

    // Group by fingerprint; keep groups with more than one row.
    const byFp = new Map<string, typeof all>();
    for (const r of all) {
      const arr = byFp.get(r.fingerprint) ?? [];
      arr.push(r);
      byFp.set(r.fingerprint, arr);
    }
    const duplicate_fingerprint_groups: DuplicateFingerprintGroup[] = [];
    for (const [fingerprint, rows] of byFp) {
      if (rows.length > 1) {
        duplicate_fingerprint_groups.push({
          fingerprint,
          copies: rows.length,
          rows: rows.map(toRow),
        });
      }
    }
    duplicate_fingerprint_groups.sort((a, b) => b.copies - a.copies);

    const invalid_language_rows = all
      .filter((r) => !r.language || !VALID_LANG_CODES.includes(r.language))
      .map(toRow);

    return {
      total_identities: all.length,
      duplicate_fingerprint_groups,
      invalid_language_rows,
      generated_at: new Date().toISOString(),
    };
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  } as never);
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}

export interface MergeResult {
  survivor: string;
  merged: number;
}

// Admin-only: merge a set of duplicate identities into one chosen survivor.
// Repoints all references (images/prices/sold comps/vault/wishlist) and
// consolidates provider keys + external ids onto the survivor.
export const mergeIdentitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { survivor: string; victims: string[]; reason?: string }) => {
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!input?.survivor || !uuid.test(input.survivor)) throw new Error("Invalid survivor id");
    if (!Array.isArray(input.victims) || input.victims.length === 0) throw new Error("No victims selected");
    for (const v of input.victims) if (!uuid.test(v)) throw new Error("Invalid victim id");
    return {
      survivor: input.survivor,
      victims: input.victims.filter((v) => v !== input.survivor),
      reason: typeof input.reason === "string" ? input.reason.slice(0, 500) : null,
    };
  })
  .handler(async ({ data, context }): Promise<MergeResult> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("admin_merge_identities" as never, {
      _actor: userId,
      _survivor: data.survivor,
      _victims: data.victims,
      _reason: data.reason,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as MergeResult;
  });

export interface RecanonicalizeResult {
  result: "updated" | "merged";
  id?: string;
  survivor?: string;
}

// Admin-only: recompute an identity's canonical fingerprint + language from its
// own card fields. If a different identity already owns that fingerprint, this
// one is merged into it instead of creating a duplicate.
export const recanonicalizeIdentityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason?: string }) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("Invalid identity id");
    return { id: input.id, reason: typeof input.reason === "string" ? input.reason.slice(0, 500) : null };
  })
  .handler(async ({ data, context }): Promise<RecanonicalizeResult> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeFingerprint, normalizeLangCode } = await import("@/lib/masterIdentity.server");

    const { data: row, error: selErr } = await supabaseAdmin
      .from("card_identities")
      .select("category, name, set_name, set_code, number, year, manufacturer, player, team, grade, grading_company, variant, language")
      .eq("id", data.id)
      .single();
    if (selErr) throw new Error(selErr.message);

    const r = row as Record<string, any>;
    const fingerprint = await computeFingerprint({
      category: r.category,
      name: r.name,
      set_name: r.set_name,
      set_code: r.set_code,
      number: r.number,
      year: r.year,
      manufacturer: r.manufacturer,
      player: r.player,
      team: r.team,
      grade: r.grade,
      grading_company: r.grading_company,
      variant: r.variant,
      language: r.language,
    });
    const language = normalizeLangCode(r.language);

    const { data: res, error } = await supabaseAdmin.rpc("admin_recanonicalize_identity" as never, {
      _actor: userId,
      _id: data.id,
      _new_fingerprint: fingerprint,
      _new_language: language,
      _reason: data.reason,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as RecanonicalizeResult;
  });

