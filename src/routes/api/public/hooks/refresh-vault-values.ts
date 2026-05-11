import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/refresh-vault-values")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require shared cron secret — this endpoint burns AI credits and writes to all users' vault cards.
        const cronSecret = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!cronSecret || !provided || provided !== cronSecret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response(JSON.stringify({ error: "missing key" }), { status: 500 });

        // Pull cards needing refresh (not valued in last 20h)
        const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
        const { data: cards, error } = await supabaseAdmin
          .from("vault_cards")
          .select("id,name,category,estimated_value,last_valued_at")
          .or(`last_valued_at.is.null,last_valued_at.lt.${cutoff}`)
          .limit(100);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        let updated = 0;
        for (const c of cards || []) {
          try {
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "TCG appraiser. Return JSON {\"estimated_value\": number} — current USD market value." },
                  { role: "user", content: `Card: ${c.name}${c.category ? ` (${c.category})` : ""}. Current value?` },
                ],
                response_format: { type: "json_object" },
              }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
            const v = Number(parsed.estimated_value);
            if (!isFinite(v) || v <= 0) continue;
            await supabaseAdmin.from("vault_cards").update({
              estimated_value: v, last_valued_at: new Date().toISOString(),
            }).eq("id", c.id);
            updated++;
          } catch {/* skip */}
        }
        return new Response(JSON.stringify({ ok: true, updated, scanned: cards?.length || 0 }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
