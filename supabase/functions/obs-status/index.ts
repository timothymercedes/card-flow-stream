// Probe a Cloudflare Stream live input for connection / health stats.
// Returns: status, isInput (live), bitrateKbps, fps, width, height, droppedFrames.
import { verifyUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeSecret = (value: string | undefined) => {
  const trimmed = value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return trimmed.replace(/^Bearer\s+/i, "").trim();
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const readProviderJson = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return { parsed: null, text: "" };
  try {
    return { parsed: JSON.parse(text), text };
  } catch {
    return { parsed: null, text };
  }
};

// The caller may only query live inputs attached to their own OBS profile or streams.
async function ownsLiveInput(userId: string, liveInputId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !/^[A-Za-z0-9_-]{1,128}$/.test(liveInputId)) return false;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const id = encodeURIComponent(liveInputId);
  const uid = encodeURIComponent(userId);
  const a = await fetch(`${url}/rest/v1/obs_profiles?select=user_id&user_id=eq.${uid}&cf_live_input_id=eq.${id}&limit=1`, { headers: h });
  if (a.ok && ((await a.json()) as unknown[]).length > 0) return true;
  const b = await fetch(`${url}/rest/v1/live_stream_credentials?select=stream_id,live_streams!inner(seller_id)&cf_live_input_id=eq.${id}&live_streams.seller_id=eq.${uid}&limit=1`, { headers: h });
  return b.ok && ((await b.json()) as unknown[]).length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await verifyUser(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const accountId = normalizeSecret(Deno.env.get("CLOUDFLARE_ACCOUNT_ID"));
    const apiToken = normalizeSecret(Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN"));
    if (!accountId || !apiToken) {
      return json({ error: "Cloudflare Stream is not configured yet." }, 503);
    }
    const raw = await req.text().catch(() => "");
    let body: any = {};
    if (raw) {
      try { body = JSON.parse(raw); } catch { body = {}; }
    }
    const { live_input_id } = body;
    if (!live_input_id) {
      return json({ error: "live_input_id required" }, 400);
    }
    if (!(await ownsLiveInput(auth.userId, String(live_input_id)))) {
      return json({ error: "Live input not found" }, 404);
    }
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${live_input_id}`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    const { parsed: j, text: providerText } = await readProviderJson(r);
    if (!r.ok || j?.success === false) {
      const code = j?.errors?.[0]?.code;
      // Rate-limited or upstream 5xx → return 200 with fallback flag so the
      // client can back off instead of crashing the page.
      if (r.status === 429 || r.status >= 500) {
        return json({
          status: "unknown",
          isInput: false,
          rateLimited: r.status === 429,
          fallback: true,
          retryAfterMs: r.status === 429 ? 30000 : 10000,
          providerStatus: r.status,
          providerCode: code ?? null,
          providerMessage: j?.errors?.[0]?.message ?? (providerText.slice(0, 160) || null),
        }, 200);
      }
      return json({
        error: code === 9106
          ? "Cloudflare Stream authentication failed. Check the account ID and Stream API token."
          : "Cloudflare Stream status is unavailable.",
        providerStatus: r.status,
        providerCode: code ?? null,
        providerMessage: j?.errors?.[0]?.message ?? (providerText.slice(0, 160) || null),
      }, code === 9106 ? 401 : 502);
    }
    const result = j?.result ?? {};
    // Map Cloudflare lifecycle → simple status
    // states: connected, ready, idle, etc.
    const cfStatus: string = result?.status || "idle";
    const isInput: boolean = cfStatus === "connected" || result?.live === true;
    let status = "offline";
    if (cfStatus === "connected") status = "live";
    else if (cfStatus === "reconnecting") status = "reconnecting";
    else if (cfStatus === "ready") status = "connected";

    // videoEncode block (when present) gives us bitrate/fps/resolution
    const v = result?.videoEncode || result?.video || {};
    return json({
      status,
      isInput,
      cfStatus,
      bitrateKbps: v?.bitrate ? Math.round(Number(v.bitrate) / 1000) : null,
      fps: v?.fps ?? null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      droppedFrames: result?.droppedFrames ?? null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
