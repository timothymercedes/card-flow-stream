// Graded card cert lookup (PSA / CGC / BGS).
// Phase 1: returns `not_configured` until API keys are added.
// POST { grader: 'psa'|'cgc'|'bgs', cert_number: string, vault_card_id?: uuid }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeFetch } from "../_shared/cards/sources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GradingResult {
  grader: string;
  cert_number: string;
  grade: string | null;
  pop_data: Record<string, unknown>;
  slab_image_url: string | null;
  raw: unknown;
}

async function lookupPsa(cert: string): Promise<GradingResult | null> {
  const token = Deno.env.get("PSA_API_TOKEN");
  if (!token) return null;
  const res = await safeFetch("psa",
    `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(cert)}`,
    { headers: { Authorization: `bearer ${token}` } },
  );
  if (!res) return null;
  try {
    const j = await res.json();
    const c = j?.PSACert ?? j;
    return {
      grader: "psa",
      cert_number: cert,
      grade: c?.CardGrade ?? c?.GradeDescription ?? null,
      pop_data: { total: c?.TotalPopulation, higher: c?.PopulationHigher },
      slab_image_url: null,
      raw: j,
    };
  } catch { return null; }
}

async function lookupCgc(cert: string): Promise<GradingResult | null> {
  const key = Deno.env.get("CGC_API_KEY");
  if (!key) return null;
  // Placeholder — CGC API is by partnership; wire when keys arrive.
  return null;
}

async function lookupBgs(cert: string): Promise<GradingResult | null> {
  // BGS does not currently expose a public API; placeholder.
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return new Response(JSON.stringify({ error: "Sign in required" }), {
      status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
    });

    const body = await req.json().catch(() => ({}));
    const grader = String(body?.grader || "").toLowerCase();
    const cert = String(body?.cert_number || "").trim();
    const vault_card_id = body?.vault_card_id ? String(body.vault_card_id) : null;
    if (!["psa", "cgc", "bgs"].includes(grader) || !cert) {
      return new Response(JSON.stringify({ error: "grader (psa|cgc|bgs) and cert_number required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const result =
      grader === "psa" ? await lookupPsa(cert) :
      grader === "cgc" ? await lookupCgc(cert) :
      await lookupBgs(cert);

    if (!result) {
      return new Response(JSON.stringify({
        ok: false,
        code: "not_configured",
        message: `${grader.toUpperCase()} lookup is not yet enabled. Add the API key to enable cert verification.`,
      }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    if (vault_card_id) {
      const admin = createClient(SUPABASE_URL, SR, { auth: { persistSession: false } });
      await admin.from("graded_cards").upsert({
        vault_card_id, user_id: u.user.id,
        grader, cert_number: cert, grade: result.grade,
        pop_data: result.pop_data, slab_image_url: result.slab_image_url,
        verified_at: new Date().toISOString(), raw: result.raw,
      }, { onConflict: "grader,cert_number" });
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("grading-lookup", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
