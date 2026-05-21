// AI shipment detection — vision call to Lovable AI Gateway.
// Reads a photo of a shipping label, USPS receipt, tracking label, postage
// stamp, or drop-off confirmation, extracts the carrier + tracking number
// and infers the shipment stage. The caller then passes the result to the
// `apply_ai_shipment_scan` RPC which matches it to one of the seller's
// orders and advances prep_status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You analyze a photo a SELLER took of shipping-related paper for a marketplace
package they are about to (or already did) drop off. Your job is OCR + classification.

DETECT:
1. document_type — one of:
   - "label"           (shipping label printed for a package — not yet shipped)
   - "receipt"         (USPS / UPS / FedEx counter receipt printed at dropoff)
   - "stamp"           (postage stamp, postage meter mark, indicia)
   - "dropoff_scan"    (carrier acceptance / "Accepted at USPS Origin Facility" / hand-stamped acceptance)
   - "tracking_screen" (screenshot of carrier tracking page)
   - "package"         (photo of the actual package showing a label)
   - "unknown"

2. carrier — one of: "USPS", "UPS", "FedEx", "DHL", "UPS Mail Innovations", "OnTrac", "Other", "Unknown".

3. tracking_number — the carrier tracking number, exactly as printed. Strip spaces but preserve digits/letters.
   USPS: 20–22 digits, often "9400 1...", "9205 5...", "EA...US" for Priority Intl.
   UPS:  starts with "1Z" then 16 alphanumerics.
   FedEx: 12 or 15 digits.
   If multiple tracking numbers are visible, return the most prominent one and put the rest in "extras".

4. shipment_status — what this document PROVES happened:
   - "label_created"     (label printed, no acceptance shown)
   - "ready_for_dropoff" (label + postage stamp visible, but no acceptance)
   - "shipped"           (receipt, drop-off scan, acceptance event, or "in transit" tracking)
   - "delivered"         (tracking page says delivered)
   Be conservative: a plain label alone is "label_created", NOT "shipped".

5. confidence — 0..1 overall confidence in your reading.

6. notes — one short sentence explaining what you saw (for audit).

Return STRICT JSON, no prose:
{
  "document_type": string,
  "carrier": string,
  "tracking_number": string,
  "extras": string[],
  "shipment_status": string,
  "confidence": number,
  "notes": string
}

If the photo is unreadable or not shipping-related, return all empty strings, confidence 0, document_type "unknown".`;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return jsonResp({ error: "AI service is not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return jsonResp({ error: "Sign in to scan shipments" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { image } = body || {};
  if (!image || typeof image !== "string") return jsonResp({ error: "Missing image" }, 400);

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [
            { type: "text", text: "Read this shipping document. Return strict JSON." },
            { type: "image_url", image_url: { url: image } },
          ]},
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 400,
      }),
    });

    if (resp.status === 429) return jsonResp({ error: "Rate limited — please slow down" }, 429);
    if (resp.status === 402) return jsonResp({ error: "AI credits exhausted" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[scan-shipment] gateway error", resp.status, t);
      return jsonResp({ error: "AI gateway error" }, 502);
    }

    const j = await resp.json();
    let parsed: any = {};
    try { parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch {}

    // Normalize
    const tracking = String(parsed.tracking_number || "").replace(/\s+/g, "").trim();
    const validStatuses = ["label_created","ready_for_dropoff","shipped","delivered"];
    const status = validStatuses.includes(parsed.shipment_status) ? parsed.shipment_status : "ready_for_dropoff";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    return jsonResp({
      ok: true,
      document_type: String(parsed.document_type || "unknown"),
      carrier: String(parsed.carrier || "Unknown"),
      tracking_number: tracking,
      extras: Array.isArray(parsed.extras) ? parsed.extras.map(String) : [],
      shipment_status: status,
      confidence,
      notes: String(parsed.notes || ""),
    });
  } catch (e: any) {
    console.error("[scan-shipment] error", e?.message);
    return jsonResp({ error: e?.message || "Scan failed" }, 500);
  }
});
