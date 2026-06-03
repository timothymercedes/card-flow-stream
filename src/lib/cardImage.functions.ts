// AI-generated preview images for trading cards (Missing Cards Center, etc.).
// Each unique card (category + set + number + name) is generated ONCE via the
// Lovable AI image gateway, cached in the `ai-card-images` storage bucket,
// and served from a signed URL on every subsequent request.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  category: z.string().max(80).optional().default(""),
  setName: z.string().max(160).optional().default(""),
  number: z.string().max(40).optional().default(""),
  name: z.string().max(200).optional().default(""),
  rarity: z.string().max(80).optional().default(""),
});

const BUCKET = "ai-card-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function buildPrompt(p: { category: string; setName: string; number: string; name: string; rarity: string }) {
  const subject = p.name || `card number ${p.number}`;
  const cat = p.category ? `${p.category} ` : "";
  const rarity = p.rarity ? `, ${p.rarity} rarity` : "";
  return (
    `A single original ${cat}collectible trading card front, portrait orientation, centered, ` +
    `studio product photo on a clean neutral background. Create legally distinct fantasy card artwork inspired by ` +
    `the catalog entry "${subject}"${p.setName ? ` from the "${p.setName}" set` : ""}${rarity}. ` +
    `Glossy foil border, premium frame, vibrant illustration, sharp focus. No logos, no readable text, ` +
    `no real people, no copyrighted characters, no watermarks, no hands.`
  );
}

function cleanBase64(value: string) {
  return value.replace(/^data:image\/\w+;base64,/, "").replace(/\s/g, "");
}

async function imageGatewayRequest(key: string, body: Record<string, unknown>) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false as const, status: res.status, text };
  try {
    const json = JSON.parse(text) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? { ok: true as const, b64: cleanBase64(b64) } : { ok: false as const, status: 502, text: "No image returned" };
  } catch {
    return { ok: false as const, status: 502, text: "Invalid image response" };
  }
}

async function generateCardImage(key: string, prompt: string) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await imageGatewayRequest(key, {
      model: "openai/gpt-image-2",
      prompt,
      size: "1024x1536",
      quality: "low",
      n: 1,
    });
    if (result.ok) return result.b64;
    last = `${result.status} ${result.text}`;
    if (result.status !== 429) break;
    await wait(2500 * (attempt + 1));
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await imageGatewayRequest(key, {
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    });
    if (result.ok) return result.b64;
    last = `${result.status} ${result.text}`;
    if (result.status !== 429) break;
    await wait(3000 * (attempt + 1));
  }

  throw new Error(last || "Image generation failed");
}

export const getOrCreateAiCardImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = keyFor({
      category: data.category,
      setName: data.setName,
      number: data.number,
      name: data.name,
    });

    const createUrl = async () => {
      const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) console.error("AI card image signed URL failed:", error);
      return signed?.signedUrl ?? null;
    };

    // 1. Serve from cache if it already exists.
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const fname = path.slice(path.lastIndexOf("/") + 1);
    const { data: existing } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(folder, { search: fname, limit: 1 });
    if (existing && existing.some((f: { name: string }) => f.name === fname)) {
      return { url: await createUrl(), cached: true };
    }

    // 2. Generate via Lovable AI image gateway (non-streaming).
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { url: null as string | null, error: "AI image generation unavailable" };

    try {
      const b64 = await generateCardImage(key, buildPrompt(data));

      const bytes = Buffer.from(b64, "base64");
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (upErr) {
        console.error("AI card image upload failed:", upErr);
        return { url: null as string | null, error: "Failed to store image" };
      }
      return { url: await createUrl(), cached: false };
    } catch (e) {
      console.error("AI card image error:", e);
      return { url: null as string | null, error: e instanceof Error ? e.message : "Image generation error" };
    }
  });
