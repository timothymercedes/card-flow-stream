// Probe a Cloudflare Stream live input for connection / health stats.
// Returns: status, isInput (live), bitrateKbps, fps, width, height, droppedFrames.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({ error: "Cloudflare Stream not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { live_input_id } = await req.json().catch(() => ({}));
    if (!live_input_id) {
      return new Response(JSON.stringify({ error: "live_input_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${live_input_id}/lifecycle`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    const j = await r.json();
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
    return new Response(JSON.stringify({
      status,
      isInput,
      cfStatus,
      bitrateKbps: v?.bitrate ? Math.round(Number(v.bitrate) / 1000) : null,
      fps: v?.fps ?? null,
      width: v?.width ?? null,
      height: v?.height ?? null,
      droppedFrames: result?.droppedFrames ?? null,
      raw: result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
