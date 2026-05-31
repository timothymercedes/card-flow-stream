// PullBid Card Identity helper — Phase 1 of internal pricing intelligence.
//
// Every provider lookup (Scryfall, TCGplayer, PriceCharting, eBay, ygoprodeck,
// etc.) should funnel through `upsertIdentity()` so we accumulate a
// provider-agnostic canonical record of every unique card+grade we've ever
// seen. Once enough observations exist, the internal pricing engine
// (Phase 3) can blend PullBid's own marketplace/live data with external
// quotes.
//
// Design rules:
//   - Identity is keyed by a deterministic `fingerprint` — never by
//     provider IDs. Providers come and go; identity persists.
//   - `category` is first-class (sports = peer of pokemon/mtg, not nested).
//   - Grade is part of identity (PSA 10 vs PSA 9 vs Raw is THREE rows).
//   - All writes use the service-role Supabase client (server-only).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Category =
  | "pokemon"
  | "mtg"
  | "yugioh"
  | "onepiece"
  | "lorcana"
  | "dbs_fusion"
  | "swu"
  | "fab"
  | "sports"
  | "other";

export interface CardIdentityInput {
  category: Category;
  name: string;
  set_name?: string | null;
  set_code?: string | null;
  number?: string | null;
  year?: number | null;
  manufacturer?: string | null;
  variant?: string | null;             // "holo" | "refractor" | "prizm" | "parallel:gold" | "1st_edition" | ...
  is_rookie?: boolean;
  player?: string | null;              // sports
  team?: string | null;                // sports
  grade?: string | null;               // "raw" | "psa_10" | "bgs_9_5" | ...
  grading_company?: string | null;     // "PSA" | "BGS" | "SGC" | "CGC"
  language?: string | null;            // "en" | "jp" | "zh" | "ko" | ... — part of identity
  image_url?: string | null;
  image_source?: string | null;
  external_ids?: Record<string, string | number | null | undefined>;
}

// Normalize any language label/code to a short canonical code so the same
// printing always fingerprints the same way (English is the implicit default).
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

// ---- Normalization --------------------------------------------------------
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")    // strip accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Deterministic fingerprint — same identity always hashes the same.
 *  Language is part of identity: a Japanese card and its English print are
 *  two different records. English keeps its legacy hash (no language segment)
 *  for backward compatibility; non-English printings append a lang segment. */
export async function computeFingerprint(input: CardIdentityInput): Promise<string> {
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

// ---- Supabase admin client (lazy) -----------------------------------------
let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

// ---- Upsert (insert or fetch by fingerprint) ------------------------------
/**
 * Returns the identity row id. If an identity with the same fingerprint
 * exists, returns it (and opportunistically fills in any missing image /
 * external_ids fields). Otherwise inserts a new row.
 */
export async function upsertIdentity(input: CardIdentityInput): Promise<string | null> {
  try {
    const fingerprint = await computeFingerprint(input);
    const sb = admin();

    // Try fetch first (cheap; avoids unnecessary writes)
    const { data: existing } = await sb
      .from("card_identities")
      .select("id, image_url, external_ids")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing) {
      // Patch in newly-available fields without overwriting good data
      const patch: Record<string, unknown> = {};
      if (!existing.image_url && input.image_url) {
        patch.image_url = input.image_url;
        patch.image_source = input.image_source ?? "provider";
      }
      const mergedIds = { ...(existing.external_ids ?? {}), ...(input.external_ids ?? {}) };
      if (Object.keys(mergedIds).length > Object.keys(existing.external_ids ?? {}).length) {
        patch.external_ids = mergedIds;
      }
      if (Object.keys(patch).length > 0) {
        await sb.from("card_identities").update(patch).eq("id", existing.id);
      }
      return existing.id as string;
    }

    const { data: inserted, error } = await sb
      .from("card_identities")
      .insert({
        category: input.category,
        name: input.name,
        set_name: input.set_name ?? null,
        set_code: input.set_code ?? null,
        number: input.number ?? null,
        year: input.year ?? null,
        manufacturer: input.manufacturer ?? null,
        variant: input.variant ?? null,
        is_rookie: input.is_rookie ?? false,
        player: input.player ?? null,
        team: input.team ?? null,
        grade: input.grade ?? "raw",
        grading_company: input.grading_company ?? null,
        language: normalizeLangCode(input.language),
        image_url: input.image_url ?? null,
        image_source: input.image_source ?? null,
        external_ids: input.external_ids ?? {},
        fingerprint,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[identity] upsert failed", error.message);
      return null;
    }
    return inserted?.id ?? null;
  } catch (err) {
    console.warn("[identity] upsert error", (err as Error).message);
    return null;
  }
}

// ---- Observation log ------------------------------------------------------
export interface PriceObservationInput {
  identity_id: string;
  source: string;                       // "tcg_api" | "scryfall" | "pricecharting" | "ebay_sold" | "pullbid_internal" | ...
  price_cents: number;
  currency?: string;
  sample_size?: number | null;
  raw_payload?: unknown;
}

/** Append a price observation. Never throws — observation logging is best-effort. */
export async function recordObservation(o: PriceObservationInput): Promise<void> {
  try {
    if (!o.identity_id || !Number.isFinite(o.price_cents) || o.price_cents < 0) return;
    await admin().from("price_observations").insert({
      identity_id: o.identity_id,
      source: o.source,
      price_cents: Math.round(o.price_cents),
      currency: o.currency ?? "USD",
      sample_size: o.sample_size ?? null,
      raw_payload: o.raw_payload ?? null,
    });
  } catch (err) {
    console.warn("[observation] insert failed", (err as Error).message);
  }
}

// ---- Sold comp log --------------------------------------------------------
export interface SoldCompInput {
  identity_id: string;
  source: "pullbid_marketplace" | "pullbid_live" | "pullbid_offer" | "ebay_sold" | "pricecharting_sold";
  sale_price_cents: number;
  currency?: string;
  sold_at: Date | string;
  channel?: string | null;              // "auction" | "buy_now" | "offer" | "live_hammer" | "bin"
  buyer_user_id?: string | null;
  seller_user_id?: string | null;
  external_url?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordSoldComp(c: SoldCompInput): Promise<void> {
  try {
    if (!c.identity_id || !Number.isFinite(c.sale_price_cents) || c.sale_price_cents < 0) return;
    await admin().from("sold_comps").insert({
      identity_id: c.identity_id,
      source: c.source,
      sale_price_cents: Math.round(c.sale_price_cents),
      currency: c.currency ?? "USD",
      sold_at: typeof c.sold_at === "string" ? c.sold_at : c.sold_at.toISOString(),
      channel: c.channel ?? null,
      buyer_user_id: c.buyer_user_id ?? null,
      seller_user_id: c.seller_user_id ?? null,
      external_url: c.external_url ?? null,
      meta: c.meta ?? {},
    });
  } catch (err) {
    console.warn("[sold_comp] insert failed", (err as Error).message);
  }
}

// ---- Image candidate log --------------------------------------------------
export async function recordImage(
  identity_id: string,
  url: string,
  source: string,
  opts: { quality_score?: number; uploaded_by?: string | null; is_primary?: boolean } = {},
): Promise<void> {
  try {
    if (!identity_id || !url) return;
    await admin().from("card_images").upsert(
      {
        identity_id,
        url,
        source,
        quality_score: opts.quality_score ?? null,
        uploaded_by: opts.uploaded_by ?? null,
        is_primary: opts.is_primary ?? false,
      },
      { onConflict: "identity_id,url", ignoreDuplicates: true },
    );
  } catch (err) {
    console.warn("[image] insert failed", (err as Error).message);
  }
}
