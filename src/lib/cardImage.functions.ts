// AI-generated preview images for trading cards (Missing Cards Center, etc.).
// Each unique card (category + set + number + name) is generated ONCE via the
// Lovable AI image gateway, cached in the public `ai-card-images` storage
// bucket, and served from a stable public URL on every subsequent request.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Input = z.object({
  category: z.string().max(80).optional().default(""),
  setName: z.string().max(160).optional().default(""),
  number: z.string().max(40).optional().default(""),
  name: z.string().max(200).optional().default(""),
  rarity: z.string().max(80).optional().default(""),
});

const BUCKET = "ai-card-images";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Stable, collision-resistant key for a card identity.
function keyFor(p: { category: string; setName: string; number: string; name: string }) {
  const raw = `${p.category}|||${p.setName}|||${p.number}|||${p.name}`.toLowerCase();
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  const label = slug([p.setName, p.number, p.name].filter(Boolean).join("-")) || "card";
  return `${label}-${h.toString(36)}.png`;
}

function publicUrl(path: string) {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

function buildPrompt(p: { category: string; setName: string; number: string; name: string; rarity: string }) {
  const subject = p.name || `card number ${p.number}`;
  const cat = p.category ? `${p.category} ` : "";
  const rarity = p.rarity ? `, ${p.rarity} rarity` : "";
  return (
    `A single high-quality ${cat}collectible trading card, front-facing, centered, ` +
    `studio product photo on a clean neutral background. The card depicts "${subject}"` +
    `${p.setName ? ` from the "${p.setName}" set` : ""}${rarity}. ` +
    `Glossy finish, sharp focus, realistic foil border and frame, vibrant artwork, ` +
    `portrait orientation, no text watermarks, no hands. Illustrative concept art, not a real licensed product.`
  );
}

export const getOrCreateAiCardImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const path = keyFor({
      category: data.category,
      setName: data.setName,
      number: data.number,
      name: data.name,
    });

    // 1. Serve from cache if it already exists.
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const fname = path.slice(path.lastIndexOf("/") + 1);
    const { data: existing } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(folder, { search: fname, limit: 1 });
    if (existing && existing.some((f: { name: string }) => f.name === fname)) {
      return { url: publicUrl(path), cached: true };
    }

    // 2. Generate via Lovable AI image gateway (non-streaming).
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { url: null as string | null, error: "AI image generation unavailable" };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-image-2",
          prompt: buildPrompt(data),
          size: "1024x1536",
          quality: "low",
          n: 1,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("AI card image gen failed:", res.status, txt);
        return { url: null as string | null, error: `Image generation failed (${res.status})` };
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) return { url: null as string | null, error: "No image returned" };

      const bytes = Buffer.from(b64, "base64");
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) {
        console.error("AI card image upload failed:", upErr);
        return { url: null as string | null, error: "Failed to store image" };
      }
      return { url: publicUrl(path), cached: false };
    } catch (e) {
      console.error("AI card image error:", e);
      return { url: null as string | null, error: "Image generation error" };
    }
  });
