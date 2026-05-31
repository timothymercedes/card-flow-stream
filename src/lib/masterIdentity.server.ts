// Server-only master card identity resolver.
//
// Mirrors the edge function's `_shared/cards/identity.ts` fingerprint + upsert
// logic so manual vault entries and corrections register into the SAME master
// identity table as live scans. Master identity = card INFORMATION (source of
// truth). Provider keys = market data. This file never touches pricing.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface MasterIdentityInput {
  category: string;
  name: string;
  set_name?: string | null;
  set_code?: string | null;
  number?: string | null;
  year?: number | null;
  // Sports/graded identity fields — MUST be part of the fingerprint so a card
  // scanned live and the same card entered manually resolve to ONE master row.
  manufacturer?: string | null;
  player?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  is_rookie?: boolean;
  team?: string | null;
  variant?: string | null;
  language?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  image_source?: string | null;
  confidence_score?: number | null;
  verification_status?: "verified" | "estimated" | "unverified";
  provider_keys?: (string | null | undefined)[];
  external_ids?: Record<string, string | number | null | undefined>;
}

export function normalizeLangCode(lang: string | null | undefined): string {
  const l = String(lang || "").trim().toLowerCase();
  if (!l) return "en";
  if (/^(en|eng|english)$/.test(l)) return "en";
  if (/^(jp|ja|jpn|japanese)$/.test(l)) return "jp";
  if (/^(zh|cn|chi|chinese|zh-hans|zh-hant)$/.test(l)) return "zh";
  if (/^(ko|kr|kor|korean)$/.test(l)) return "ko";
  if (/^(fr|fra|fre|french)$/.test(l)) return "fr";
  if (/^(de|deu|ger|german)$/.test(l)) return "de";
  if (/^(es|spa|spanish)$/.test(l)) return "es";
  if (/^(it|ita|italian)$/.test(l)) return "it";
  if (/^(pt|por|portuguese)$/.test(l)) return "pt";
  return l.slice(0, 4);
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export async function computeFingerprint(input: MasterIdentityInput): Promise<string> {
  const segs = [
    input.category,
    norm(input.name),
    norm(input.set_code || input.set_name),
    norm(input.number),
    input.year ?? "",
    norm(input.manufacturer),
    norm(input.variant),
    norm(input.player),
    norm(input.grade) || "raw",
    norm(input.grading_company),
  ];
  const lang = normalizeLangCode(input.language);
  if (lang !== "en") segs.push(`lang_${lang}`);
  const parts = segs.join("|");
  const buf = new TextEncoder().encode(parts);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ResolveResult {
  identityId: string | null;
  created: boolean;
  fingerprint: string;
}

/** Resolve an existing master identity by fingerprint, or create one. */
export async function resolveOrCreateMasterIdentity(input: MasterIdentityInput): Promise<ResolveResult> {
  const cleanKeys = (input.provider_keys ?? [])
    .map((k) => (k == null ? "" : String(k).trim()))
    .filter((k) => k.length > 0);
  const fingerprint = await computeFingerprint(input);
  console.log("[master-identity] resolve start", JSON.stringify({
    fingerprint, name: input.name, category: input.category,
    set: input.set_code || input.set_name, number: input.number,
    language: normalizeLangCode(input.language), variant: input.variant,
  }));

  const { data: existing, error: selErr } = await supabaseAdmin
    .from("card_identities")
    .select("id, image_url, external_ids, provider_keys, rarity, confidence_score")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (selErr) console.warn("[master-identity] select failed", selErr.message);

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.image_url && input.image_url) {
      patch.image_url = input.image_url;
      patch.image_source = input.image_source ?? "user";
    }
    if (!existing.rarity && input.rarity) patch.rarity = input.rarity;
    if (existing.confidence_score == null && input.confidence_score != null) {
      patch.confidence_score = input.confidence_score;
    }
    const mergedIds = { ...(((existing.external_ids ?? {}) as Record<string, unknown>)), ...(input.external_ids ?? {}) };
    if (Object.keys(mergedIds).length > Object.keys(existing.external_ids ?? {}).length) {
      patch.external_ids = mergedIds;
    }
    const existingKeys: string[] = Array.isArray(existing.provider_keys) ? existing.provider_keys : [];
    const mergedKeys = Array.from(new Set([...existingKeys, ...cleanKeys]));
    if (mergedKeys.length > existingKeys.length) patch.provider_keys = mergedKeys;
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabaseAdmin
        .from("card_identities").update(patch as never).eq("id", existing.id);
      if (updErr) console.warn("[master-identity] patch failed", updErr.message);
    }
    console.log("[master-identity] resolved existing", existing.id);
    return { identityId: existing.id as string, created: false, fingerprint };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("card_identities")
    .insert({
      category: input.category,
      name: input.name,
      set_name: input.set_name ?? null,
      set_code: input.set_code ?? null,
      number: input.number ?? null,
      year: input.year ?? null,
      manufacturer: input.manufacturer ?? null,
      player: input.player ?? null,
      team: input.team ?? null,
      grade: input.grade ?? "raw",
      grading_company: input.grading_company ?? null,
      is_rookie: input.is_rookie ?? false,
      variant: input.variant ?? null,
      language: normalizeLangCode(input.language),
      rarity: input.rarity ?? null,
      image_url: input.image_url ?? null,
      image_source: input.image_source ?? null,
      external_ids: input.external_ids ?? {},
      provider_keys: cleanKeys,
      confidence_score: input.confidence_score ?? null,
      verification_status: input.verification_status ?? "unverified",
      fingerprint,
    } as never)
    .select("id")
    .single();

  if (error) {
    console.warn("[master-identity] insert failed", error.message, error.details ?? "", error.hint ?? "");
    return { identityId: null, created: false, fingerprint };
  }
  console.log("[master-identity] created new", (inserted as { id: string }).id);
  return { identityId: (inserted as { id: string }).id, created: true, fingerprint };
}
