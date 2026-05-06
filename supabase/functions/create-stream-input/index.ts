// Provision a Cloudflare Stream Live Input for a seller's stream.
// Returns RTMPS URL + stream key for OBS, and HLS playback URL for viewers.

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

    const { meta_name } = await req.json().catch(() => ({}));

    const cf = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meta: { name: meta_name || "Lovable live stream" },
          recording: { mode: "automatic", requireSignedURLs: false },
          defaultCreator: "lovable",
        }),
      },
    );

    const data = await cf.json();
    if (!cf.ok || !data.success) {
      return new Response(JSON.stringify({ error: "Cloudflare error", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = data.result;
    // RTMPS ingest: combine url + streamKey for OBS
    const rtmps_url: string = r?.rtmps?.url || "rtmps://live.cloudflare.com:443/live/";
    const stream_key: string = r?.rtmps?.streamKey || "";
    const live_input_id: string = r?.uid || "";

    // WebRTC/WHIP ingest URL — used by the in-browser canvas compositor.
    // Falls back to the documented format if the API doesn't echo it back.
    const whip_url: string =
      r?.webRTC?.url ||
      `https://customer-${accountId}.cloudflarestream.com/${live_input_id}/webRTC/publish`;

    // HLS playback (works as soon as broadcaster goes live)
    const hls_url = `https://customer-${accountId}.cloudflarestream.com/${live_input_id}/manifest/video.m3u8`;

    return new Response(JSON.stringify({
      live_input_id,
      rtmps_url,
      stream_key,
      hls_url,
      whip_url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
