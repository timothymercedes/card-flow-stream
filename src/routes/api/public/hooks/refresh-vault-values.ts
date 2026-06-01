import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { categoryToGameId } from "@/lib/scannerGame";

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
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!serviceKey || !supabaseUrl) return new Response(JSON.stringify({ error: "missing backend config" }), { status: 500 });

        // Pull cards needing refresh (not valued in last 20h)
        const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
        const { data: cards, error } = await supabaseAdmin
          .from("vault_cards")
          .select("id,name,category,tcg_set,tcg_number,tcg_year,variant,rarity,estimated_value,last_valued_at,price_locked,confirmed_by,price_source,card_identity_id")
          .or(`last_valued_at.is.null,last_valued_at.lt.${cutoff}`)
          .limit(100);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        let updated = 0;
        for (const c of cards || []) {
          try {
            if (c.price_locked) continue;
            // A user-confirmed card is permanently bound to its chosen master
            // identity. The daily sync may refresh its MARKET VALUE, but must
            // never re-identify it, overwrite its name/set/number/rarity, or push
            // it back into review based on a fresh recommendation match.
            const confirmed = !!c.confirmed_by || c.price_source === "user_confirmed" || c.price_source === "manual_entry";
            const resp = await fetch(`${supabaseUrl}/functions/v1/card-price`, {
              method: "POST",
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                // Lock the lookup to the confirmed catalog identity when we have
                // one, so the value tracks the SAME card the user confirmed.
                card_id: confirmed && c.card_identity_id && !String(c.card_identity_id).startsWith("csv-") ? c.card_identity_id : undefined,
                name: c.name,
                set: c.tcg_set || undefined,
                number: c.tcg_number || undefined,
                year: c.tcg_year || undefined,
                category: c.category || undefined,
                game: categoryToGameId(c.category),
                variant: c.variant || undefined,
                skip_cache: true,
              }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const v = Number(data?.price?.market) || 0;
            const card = data?.card || {};
            const complete = !!(card.name && card.set_name && card.number && card.year && (card.rarity || c.rarity || c.variant));
            const suspicious = !!data?.price_suspicious;
            const safe = data?.pricing_tier === "verified" && data?.price_confidence !== "low" && !data?.price_is_ai && v > 0 && complete && !suspicious;
            // Store the best available value (verified, estimated, or AI) so an
            // identified card never resets to $0. Only suspicious values — which
            // indicate a wrong product/variant match — are withheld.
            const storedValue = v > 0 && !suspicious ? v : 0;
            // Base patch: price-only fields, always applied.
            const patch: Record<string, unknown> = {
              estimated_value: storedValue,
              market_price: v || null,
              price_source: confirmed ? c.price_source : (data?.primary_source || null),
              price_confidence: data?.price_confidence || "low",
              price_is_ai: !!data?.price_is_ai,
              price_tier: suspicious ? "estimated" : (data?.pricing_tier || "unavailable"),
              price_updated_at: new Date().toISOString(),
              last_valued_at: new Date().toISOString(),
              last_rescan_at: new Date().toISOString(),
              confidence_score: Number(data?.confidence || 0) || null,
              identification_details: { pricing: data },
            };
            if (!confirmed) {
              // Only unconfirmed (suggestion-stage) cards may be re-identified and
              // re-flagged for review by the daily sync.
              patch.needs_review = !safe;
              patch.review_reason = safe ? null : suspicious ? (data?.suspicious_reason || "Market value looks wrong — flagged for re-sync.") : !card.variant && !c.variant ? "Variant not detected — confirm the variant to verify this value." : data?.tier_reason || "Estimated value shown — confirm the card to verify it.";
              patch.name = card.name || c.name;
              patch.tcg_set = card.set_name || c.tcg_set;
              patch.tcg_number = card.number || c.tcg_number;
              patch.tcg_year = card.year || c.tcg_year;
              patch.rarity = card.rarity || c.rarity;
            } else {
              // Confirmed card stays verified; never reset to $0 over a transient
              // empty/suspicious lookup — keep the last known value instead.
              patch.needs_review = false;
              patch.confidence_score = 0.97;
              if (storedValue <= 0) {
                patch.estimated_value = c.estimated_value;
                patch.price_tier = "verified";
              }
            }
            await supabaseAdmin.from("vault_cards").update(patch).eq("id", c.id);
            updated++;
          } catch {/* skip */}
        }

        // Record a daily vault-value snapshot per user so the growth chart
        // accrues history even for users who don't open the app.
        let snapshots = 0;
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { data: allCards } = await supabaseAdmin
            .from("vault_cards")
            .select("user_id,estimated_value,purchase_price");
          const agg = new Map<string, { value: number; cost: number; count: number }>();
          for (const c of allCards || []) {
            if (!c.user_id) continue;
            const a = agg.get(c.user_id) || { value: 0, cost: 0, count: 0 };
            a.value += Number(c.estimated_value || 0);
            a.cost += Number(c.purchase_price || 0);
            a.count += 1;
            agg.set(c.user_id, a);
          }
          const rows = Array.from(agg.entries()).map(([user_id, a]) => ({
            user_id, snapshot_date: today, total_value: a.value, total_cost: a.cost, card_count: a.count,
          }));
          if (rows.length) {
            const { error: snapErr } = await supabaseAdmin
              .from("vault_value_snapshots")
              .upsert(rows, { onConflict: "user_id,snapshot_date" });
            if (!snapErr) snapshots = rows.length;
          }
        } catch {/* snapshots are best-effort */}

        return new Response(JSON.stringify({ ok: true, updated, scanned: cards?.length || 0, snapshots }), { headers: { "Content-Type": "application/json" } });

      },
    },
  },
});
