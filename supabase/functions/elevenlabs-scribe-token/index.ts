// Issues a single-use ElevenLabs Realtime Scribe token (15-min TTL).
// Used by the live caption overlay for ultra-low-latency speech-to-text.
import { verifyUser } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const auth = await verifyUser(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Captions not configured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const r = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });
  if (!r.ok) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: err.slice(0, 300) }), {
      status: r.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const data = await r.json();
  return new Response(JSON.stringify({ token: data.token }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
