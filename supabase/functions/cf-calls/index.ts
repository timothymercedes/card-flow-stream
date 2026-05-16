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

function getCallsConfig() {
  const rawAppId = Deno.env.get("CLOUDFLARE_CALLS_APP_ID")?.trim();
  const appId = rawAppId?.replace(/-/g, "");
  const appToken = Deno.env.get("CLOUDFLARE_CALLS_APP_TOKEN")?.trim();

  return {
    rawAppId,
    appId,
    appToken,
    base: `https://rtc.live.cloudflare.com/v1/apps/${appId}`,
  };
}

function jwtClaimKeys(token?: string) {
  try {
    const payload = token?.split(".")[1];
    if (!payload) return [];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return Object.keys(JSON.parse(json)).sort();
  } catch {
    return [];
  }
}

function isRealtimeKitMeetingToken(token?: string) {
  const keys = jwtClaimKeys(token);
  return keys.includes("meetingId") && keys.includes("participantId");
}

function requestHasBearer(req: Request) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  return !!authHeader?.toLowerCase().startsWith("bearer ");
}

function isReceiveOnlyTracksRequest(path: string, method: string, body: string | undefined) {
  if (method !== "POST" || !/\/sessions\/[^/]+\/tracks\/new$/.test(path)) return false;
  try {
    const parsed = JSON.parse(body || "{}");
    const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
    return tracks.length > 0 && tracks.every((track: any) => track?.location === "remote");
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  // strip "/cf-calls" prefix from edge function routing
  const path = url.pathname.replace(/^\/cf-calls/, "") || "/";
  const body = req.method === "GET" ? undefined : await req.text();
  const publicViewerRequest =
    !requestHasBearer(req) &&
    ((req.method === "POST" && path === "/sessions/new") ||
      (req.method === "PUT" && /\/sessions\/[^/]+\/renegotiate$/.test(path)) ||
      isReceiveOnlyTracksRequest(path, req.method, body));

  const auth = publicViewerRequest ? null : await verifyUser(req);
  if (auth && !auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const dbgUrl = new URL(req.url);
  if (dbgUrl.pathname.endsWith("/_probe")) {
    // Diagnostic probe — admin/owner only. Leaks internal Cloudflare Calls
    // configuration if exposed, so it must be gated behind authentication
    // AND an elevated role.
    const { userHasAdminRole } = await import("../_shared/auth.ts");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Missing Authorization bearer token" }), {
        status: 401,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
    const isAdmin = await userHasAdminRole(auth.userId);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }
    const config = getCallsConfig();
    const r = await fetch(`${config.base}/sessions/new`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.appToken}`, "Content-Type": "application/json" },
    });
    const text = await r.text();
    return new Response(
      JSON.stringify({
        rawAppIdLen: config.rawAppId?.length,
        appIdLen: config.appId?.length,
        appIdPrefix: config.appId?.slice(0, 8),
        tokenLen: config.appToken?.length,
        tokenLooksLikeJwt: (config.appToken?.split(".").length ?? 0) === 3,
        tokenClaimKeys: jwtClaimKeys(config.appToken),
        status: r.status,
        ok: r.ok,
        bodyPreview: text.slice(0, 80),
      }),
      { headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  const config = getCallsConfig();
  if (!config.appId || !config.appToken) {
    return new Response(JSON.stringify({ error: "Cloudflare Calls not configured" }), {
      status: 500,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
  if (isRealtimeKitMeetingToken(config.appToken)) {
    return new Response(
      JSON.stringify({
        error:
          "Cloudflare token is a Realtime meeting participant token, but this live video feature needs the SFU App Secret.",
      }),
      {
        status: 500,
        headers: { ...CORS, "content-type": "application/json" },
      },
    );
  }
  try {
    const upstream = await fetch(`${config.base}${path}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${config.appToken}`,
        "Content-Type": "application/json",
      },
      body: body && body.length > 0 ? body : undefined,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...CORS,
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
