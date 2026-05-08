// ElevenLabs TTS narration. Auth required. Returns mp3 audio.
import { verifyUser } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const auth = await verifyUser(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: { text?: string; voiceId?: string; modelId?: string };
  try { body = await req.json(); } catch { body = {}; }
  const text = (body.text || "").trim();
  if (!text || text.length > 5000) {
    return new Response(JSON.stringify({ error: "text required (max 5000 chars)" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "TTS not configured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const voiceId = body.voiceId || DEFAULT_VOICE;
  const modelId = body.modelId || "eleven_multilingual_v2";

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
    },
  );

  if (!r.ok) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: err.slice(0, 300) }), {
      status: r.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(r.body, {
    status: 200,
    headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});
