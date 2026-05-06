// Probe a Cloudflare Stream live input for connection / health stats.
// Returns: status, isInput (live), bitrateKbps, fps, width, height, droppedFrames.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const accountId = normalizeSecret(Deno.env.get("CLOUDFLARE_ACCOUNT_ID"));
    const apiToken = normalizeSecret(Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN"));
    if (!accountId || !apiToken) {
      return json({ error: "Cloudflare Stream is not configured yet." }, 503);
    }
    const { live_input_id } = await req.json().catch(() => ({}));
    if (!live_input_id) {
      return json({ error: "live_input_id required" }, 400);
    }
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${live_input_id}/lifecycle`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    const j = await r.json();
    if (!r.ok || j?.success === false) {
      const code = j?.errors?.[0]?.code;
      return json({
        error: code === 9106
          ? "Cloudflare Stream authentication failed. Check the account ID and Stream API token."
          : "Cloudflare Stream status is unavailable.",
        providerStatus: r.status,
        providerCode: code ?? null,
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
      raw: result,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
