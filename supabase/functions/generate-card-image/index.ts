// Generate a representative card image via Lovable AI Gateway and upload to vault-images bucket.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await verifyUser(req);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { name, category, set, year, tcg_number } = await req.json();
    if (!name) return new Response(JSON.stringify({ error: "Missing name" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userId = auth.userId;

    const desc = [name, category, set, year, tcg_number && `#${tcg_number}`].filter(Boolean).join(" • ");
    const prompt = `A high-quality, photorealistic image of the trading card "${desc}". Centered card, clean neutral background, sharp focus, accurate artwork and typography for this specific card. Square aspect ratio.`;

    async function callModel(model: string) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      const txt = await r.text();
      let json: any = null;
      try { json = JSON.parse(txt); } catch {}
      return { ok: r.ok, status: r.status, txt, json };
    }

    // Try valid image models in order; fall back across providers for reliability.
    const models = [
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
      "openai/gpt-image-1-mini",
    ];
    let dataUrl: string | null = null;
    let lastErr = "";
    for (const m of models) {
      const r = await callModel(m);
      if (!r.ok) { lastErr = `${m}: ${r.status} ${r.txt}`; console.error("AI error", lastErr); continue; }
      dataUrl = r.json?.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
      if (dataUrl) break;
      lastErr = `${m}: no image in response — ${r.txt.slice(0, 300)}`;
      console.error(lastErr);
    }
    if (!dataUrl) return new Response(JSON.stringify({ error: "No image returned", details: lastErr }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Upload to storage so client gets a small URL (not a multi-MB base64)
    if (userId) {
      try {
        const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (m) {
          const mime = m[1];
          const ext = mime.split("/")[1] || "png";
          const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
          const path = `${userId}/${crypto.randomUUID()}.${ext}`;
          const admin = createClient(supaUrl, serviceKey);
          const up = await admin.storage.from("vault-images").upload(path, bytes, { contentType: mime, upsert: false });
          if (!up.error) {
            const { data: pub } = admin.storage.from("vault-images").getPublicUrl(path);
            return new Response(JSON.stringify({ image: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      } catch {/* fallback to data url */}
    }
    return new Response(JSON.stringify({ image: dataUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
