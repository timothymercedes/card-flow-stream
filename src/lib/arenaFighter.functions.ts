// PullBid Arena — Companion battle-figure generator.
// A collected CARD unlocks a digital fighter. To make battles actually look
// like the card's character (not a cropped card photo), we use Lovable AI to
// redraw the card's hero/creature as a full-body, dynamic battle figure on a
// transparent background, then cache it on the companion row so it's generated
// at most once per companion. Real cards are never affected.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIGHTER_BUCKET = "vault-images";

// Ask the gateway to turn a card photo into a clean character figure.
function fighterPrompt(name: string, category: string | null | undefined) {
  return [
    `Redraw the MAIN CHARACTER, creature or athlete shown on this trading card as a single full-body battle figure.`,
    `Subject: "${name}"${category ? ` (${category})` : ""}.`,
    `Dynamic heroic fighting pose, facing forward, full body head-to-toe, centered.`,
    `High-quality polished video-game character art, vivid colors, clean rim lighting.`,
    `IMPORTANT: isolate the character on a fully TRANSPARENT background — no card frame,`,
    `no card border, no text, no logos, no background scenery. Just the character.`,
  ].join(" ");
}

async function callImageModel(apiKey: string, model: string, prompt: string, cardUrl: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: cardUrl } },
          ],
        },
      ],
    }),
  });
  const txt = await r.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* noop */ }
  return { ok: r.ok, status: r.status, txt, json };
}

// Generate (or reuse) the battle figure for a single companion row. Returns the
// stored public URL, or null on failure (caller falls back to card art).
export async function ensureFighterForCompanion(companion: {
  id: string; user_id: string; name: string; category: string | null; image_url: string | null; fighter_image_url?: string | null;
}): Promise<string | null> {
  if (companion.fighter_image_url) return companion.fighter_image_url;
  if (!companion.image_url) return null;

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const prompt = fighterPrompt(companion.name, companion.category);
  const models = ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image-preview"];

  let dataUrl: string | null = null;
  for (const m of models) {
    try {
      const res = await callImageModel(apiKey, m, prompt, companion.image_url);
      if (!res.ok) continue;
      dataUrl = res.json?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
      if (dataUrl) break;
    } catch { /* try next */ }
  }
  if (!dataUrl) return null;

  // Persist the generated figure to storage so the client gets a small URL.
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  let publicUrl = dataUrl;
  if (match) {
    try {
      const mime = match[1];
      const ext = mime.split("/")[1] || "png";
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      const path = `${companion.user_id}/arena-fighters/${companion.id}.${ext}`;
      const up = await supabaseAdmin.storage.from(FIGHTER_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      if (!up.error) {
        const { data: pub } = supabaseAdmin.storage.from(FIGHTER_BUCKET).getPublicUrl(path);
        publicUrl = pub.publicUrl;
      }
    } catch { /* fall back to data url */ }
  }

  await supabaseAdmin.from("arena_companions").update({ fighter_image_url: publicUrl }).eq("id", companion.id);
  return publicUrl;
}

// Client-callable: ensure the figure for one of MY companions before a battle.
export const ensureCompanionFighter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: c } = await supabaseAdmin
      .from("arena_companions")
      .select("id, user_id, name, category, image_url, fighter_image_url")
      .eq("id", data.companionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!c) return { fighterImage: null as string | null };
    const fighterImage = await ensureFighterForCompanion(c as any);
    return { fighterImage };
  });
