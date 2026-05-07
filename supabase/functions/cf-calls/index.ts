// Cloudflare Calls SFU proxy.
// The browser never sees the App Token — all signed requests go through here.
// Endpoints:
//   POST  /sessions/new                -> create a Calls session
//   POST  /sessions/:id/tracks/new     -> add local tracks (publish) or pull remote tracks
//   PUT   /sessions/:id/renegotiate    -> renegotiate SDP
//   PUT   /sessions/:id/tracks/close   -> close tracks
import { verifyUser } from "../_shared/auth.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

const APP_ID = Deno.env.get("CLOUDFLARE_CALLS_APP_ID");
const APP_TOKEN = Deno.env.get("CLOUDFLARE_CALLS_APP_TOKEN");
const BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const dbgUrl = new URL(req.url);
  if (dbgUrl.pathname.endsWith("/_probe")) {
    const r = await fetch(`${BASE}/sessions/new`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${APP_TOKEN}`, "Content-Type": "application/json" },
    });
    const text = await r.text();
    return new Response(JSON.stringify({
      appIdLen: APP_ID?.length, appIdPrefix: APP_ID?.slice(0, 8),
      tokenLen: APP_TOKEN?.length, tokenPrefix: APP_TOKEN?.slice(0, 6),
      status: r.status, body: text,
    }), { headers: { ...CORS, "content-type": "application/json" } });
  }

  const auth = await verifyUser(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  if (!APP_ID || !APP_TOKEN) {
    return new Response(JSON.stringify({ error: "Cloudflare Calls not configured" }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });
  }
  const url = new URL(req.url);
  // strip "/cf-calls" prefix from edge function routing
  const path = url.pathname.replace(/^\/cf-calls/, "") || "/";

  try {
    const body = req.method === "GET" ? undefined : await req.text();
    const upstream = await fetch(`${BASE}${path}`, {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${APP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body && body.length > 0 ? body : undefined,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, "content-type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
