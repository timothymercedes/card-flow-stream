// Provision a Cloudflare Stream Live Input for a seller's stream.
// Returns RTMPS URL + stream key for OBS, and HLS playback URL for viewers.

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

    const body = await req.json().catch(() => ({}));
    const { meta_name, diagnose } = body || {};

    if (diagnose) {
      const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { "Authorization": `Bearer ${apiToken}` },
      }).then(r => r.json()).catch(e => ({ error: String(e) }));
      const accts = await fetch("https://api.cloudflare.com/client/v4/accounts", {
        headers: { "Authorization": `Bearer ${apiToken}` },
      }).then(r => r.json()).catch(e => ({ error: String(e) }));
      return json({
        configured_account_id: accountId,
        account_id_length: accountId.length,
        token_length: apiToken.length,
        verify,
        accounts_visible_to_token: (accts?.result || []).map((a: any) => ({ id: a.id, name: a.name })),
        accounts_raw_errors: accts?.errors,
      });
    }

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
      const code = data?.errors?.[0]?.code;
      const isAuthFailure = cf.status === 400 && code === 9106;
      return json({
        error: isAuthFailure
          ? "Cloudflare Stream authentication failed. Check the account ID and Stream API token."
          : "Cloudflare Stream could not create a live input.",
        providerStatus: cf.status,
        providerCode: code ?? null,
        details: data?.errors ?? data,
      }, isAuthFailure ? 401 : 502);
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

    return json({
      live_input_id,
      rtmps_url,
      stream_key,
      hls_url,
      whip_url,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
