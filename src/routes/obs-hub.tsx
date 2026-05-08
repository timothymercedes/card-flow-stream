import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Radio,
  Copy,
  Download,
  RefreshCw,
  Activity,
  Wifi,
  WifiOff,
  Smartphone,
  Monitor,
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { LISTING_CATEGORIES } from "@/lib/listingCategories";
import { TCG_TAGS, type TcgTag } from "@/lib/streamTaxonomy";
import { useTour } from "@/components/MascotGuide";
import { SellerAgreementGate } from "@/components/SellerAgreementGate";

export const Route = createFileRoute("/obs-hub")({
  head: () => ({ meta: [{ title: "OBS Streamer Hub — PullBid Live" }] }),
  component: ObsHub,
});

type ObsProfile = {
  user_id: string;
  cf_live_input_id: string | null;
  cf_rtmps_url: string | null;
  cf_stream_key: string | null;
  cf_playback_hls: string | null;
  cf_whip_url: string | null;
  default_title: string | null;
  default_category: string | null;
  default_tcg_tags: string[];
  default_stream_type: string;
  preferred_method: string;
};

type Health = {
  status: "offline" | "connected" | "live" | "reconnecting";
  bitrateKbps: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  droppedFrames: number | null;
};

function ObsHub() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { triggerOnce } = useTour();

  const [profile, setProfile] = useState<ObsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [polling, setPolling] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    triggerOnce("obs-connect");
  }, [triggerOnce]);

  // Load OBS profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("obs_profiles" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile((data as any) || null);
      setLoading(false);
    })();
  }, [user]);

  async function checkConnection(manual = false) {
    if (!profile?.cf_live_input_id) return;
    setPolling(true);
    setSetupError(null);
    const { data, error } = await supabase.functions.invoke("obs-status", {
      body: { live_input_id: profile.cf_live_input_id },
    });
    if (error || (data as any)?.error) {
      const message = (data as any)?.error || error?.message || "Could not check OBS connection.";
      setSetupError(message);
      if (manual) toast.error(message);
    } else if (data) {
      const next = data as Health;
      setHealth(next);
      if (manual) {
        if (next.status === "connected" || next.status === "live")
          toast.success("OBS is connected");
        else
          toast.error(
            "OBS is not reaching PullBidLive yet. Use Service: Custom, then paste the Server URL and Stream Key exactly.",
          );
      }
    }
    setPolling(false);
  }

  // Poll Cloudflare lifecycle every 6s once we have a live input
  useEffect(() => {
    if (!profile?.cf_live_input_id) return;
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await checkConnection(false);
    };
    tick();
    pollRef.current = window.setInterval(tick, 6000) as unknown as number;
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [profile?.cf_live_input_id]);

  async function provision() {
    if (!user) return;
    setProvisioning(true);
    setSetupError(null);
    const { data, error } = await supabase.functions.invoke("create-stream-input", {
      body: { meta_name: `OBS Hub — ${user.id.slice(0, 6)}` },
    });
    if (error || (data as any)?.error) {
      setProvisioning(false);
      const message = (data as any)?.error || error?.message || "Could not provision OBS.";
      setSetupError(message);
      return toast.error(message);
    }
    const d = data as any;
    const row = {
      user_id: user.id,
      cf_live_input_id: d.live_input_id,
      cf_rtmps_url: d.rtmps_url,
      cf_stream_key: d.stream_key,
      cf_playback_hls: d.hls_url,
      cf_whip_url: d.whip_url,
      preferred_method: "obs",
    };
    const { data: up, error: upErr } = await supabase
      .from("obs_profiles" as any)
      .upsert(row)
      .select()
      .single();
    setProvisioning(false);
    if (upErr) return toast.error(upErr.message);
    setProfile(up as any);
    toast.success("OBS profile ready — copy keys or download .ini");
  }

  async function saveDefaults(patch: Partial<ObsProfile>) {
    if (!user || !profile) return;
    const merged = { ...profile, ...patch };
    setProfile(merged);
    await supabase
      .from("obs_profiles" as any)
      .update(patch)
      .eq("user_id", user.id);
  }

  async function copy(text: string, label: string) {
    if (!text) return toast.error(`${label} is not ready yet`);
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  async function downloadProfile() {
    if (!profile?.cf_rtmps_url || !profile?.cf_stream_key) {
      toast.error("Connect OBS first — no RTMP URL or stream key yet");
      return;
    }
    const ini = [
      "[General]",
      "Name=PullBidLive",
      "",
      "[Stream1]",
      "IgnoreRecommended=true",
      "EnableMultitrackVideo=false",
      "MultitrackVideoConfigOverrideEnabled=false",
      "MultitrackVideoConfigOverride=",
      "MultitrackVideoMaximumAggregateBitrateAuto=true",
      "MultitrackVideoMaximumVideoTracksAuto=true",
      "MultitrackVideoStreamDumpEnabled=false",
      "",
      "[Output]",
      "Mode=Simple",
      "",
      "[SimpleOutput]",
      "VBitrate=4000",
      "ABitrate=160",
      "StreamEncoder=x264",
      "RecEncoder=x264",
      "Preset=veryfast",
      "",
      "[Video]",
      "BaseCX=1280",
      "BaseCY=720",
      "OutputCX=1280",
      "OutputCY=720",
      "FPSCommon=30",
      "",
    ].join("\n");

    const serviceJson = JSON.stringify(
      {
        settings: {
          bwtest: false,
          key: profile.cf_stream_key,
          server: profile.cf_rtmps_url,
          service: "Custom",
          use_auth: false,
        },
        type: "rtmp_custom",
      },
      null,
      2,
    );

    const zip = makeStoredZip({
      "PullBidLive/basic.ini": ini,
      "PullBidLive/service.json": serviceJson,
    });
    const blob = new Blob([zip], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PullBidLive-OBS-profile.zip";
    a.click();
    URL.revokeObjectURL(url);
      toast.success("Fixed OBS profile downloaded — import it as a new OBS profile, then Start Streaming");
  }

  // Cloudflare also accepts non-TLS rtmp:// on port 1935 — useful when corporate
  // firewalls or older OBS builds choke on rtmps://.
  const rtmpFallbackUrl = profile?.cf_rtmps_url
    ? profile.cf_rtmps_url.replace(/^rtmps:\/\//, "rtmp://").replace(":443/", ":1935/")
    : "";

  // Pre-flight readiness — must be true before "Go Live with OBS"
  const preflight = {
    streamKey: !!profile?.cf_stream_key,
    rtmpUrl: !!profile?.cf_rtmps_url,
    title: !!profile?.default_title?.trim(),
    tags: (profile?.default_tcg_tags?.length ?? 0) > 0,
    encoderConnected: health?.status === "connected" || health?.status === "live",
  };
  const preflightReady =
    preflight.streamKey && preflight.rtmpUrl && preflight.title && preflight.tags;

  async function goLiveWithObs() {
    if (!user || !profile) return;
    if (!profile.default_title?.trim())
      return toast.error("Set a stream title in your saved defaults");
    if (!profile.default_tcg_tags?.length) return toast.error("Pick at least one TCG tag");
    setLaunching(true);
    // Block if already open
    const { data: open } = await supabase
      .from("live_streams")
      .select("id, mode")
      .eq("seller_id", user.id)
      .in("status", ["live", "paused"])
      .maybeSingle();
    if (open) {
      setLaunching(false);
      toast.error("You already have an open stream — end it first");
      return nav({ to: "/live/$id", params: { id: open.id } });
    }
    const { data, error } = await supabase
      .from("live_streams")
      .insert({
        seller_id: user.id,
        title: profile.default_title.trim(),
        category: profile.default_category || null,
        stream_type: profile.default_stream_type || "auction",
        tcg_tags: profile.default_tcg_tags,
        listing_type: "auction",
        starting_bid: 1,
        current_bid: 1,
        current_item: profile.default_title.trim(),
        status: "live",
        is_active: true,
        started_at: new Date().toISOString(),
        cf_playback_hls: profile.cf_playback_hls,
        cf_whip_url: null,
      })
      .select()
      .single();
    setLaunching(false);
    if (error) return toast.error(error.message);
    if (profile.cf_live_input_id || profile.cf_rtmps_url || profile.cf_stream_key) {
      await supabase.from("live_stream_credentials" as any).insert({
        stream_id: data.id,
        cf_live_input_id: profile.cf_live_input_id ?? null,
        cf_rtmps_url: profile.cf_rtmps_url ?? null,
        cf_stream_key: profile.cf_stream_key ?? null,
      });
    }
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  if (!user) {
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">OBS Streamer Hub</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to set up OBS.</p>
          <Link
            to="/auth"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            Sign In
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <SellerAgreementGate>
      <AppShell>
        <div className="space-y-4 px-4 py-4">
          <header className="rounded-2xl bg-card p-4">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">OBS Streamer Hub</h1>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy these exact OBS settings. Do not choose Twitch, YouTube, or Enhanced Broadcast.
            </p>
          </header>

          {setupError ? (
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{setupError}</p>
            </div>
          ) : null}

          {/* Status pill */}
          <StatusPill profile={profile} health={health} polling={polling} />

          {/* Step 1: provision */}
          {loading ? (
            <div className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : !profile?.cf_stream_key ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="mb-1 text-sm font-bold">Step 1 · Connect OBS</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Tap below — we generate a permanent RTMPS URL and stream key you can save in OBS
                once and reuse forever.
              </p>
              <button
                onClick={provision}
                disabled={provisioning}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {provisioning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                {provisioning ? "Provisioning…" : "Connect OBS"}
              </button>
            </div>
          ) : (
            <>
              {/* Step 2: keys */}
              <div className="rounded-2xl bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold">Step 2 · Paste in OBS</p>
                  <button
                    onClick={() => provision()}
                    className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-semibold"
                    title="Generate a fresh stream key"
                  >
                    <RefreshCw className="h-3 w-3" /> Rotate key
                  </button>
                </div>

                {/* Step-by-step instructions */}
                <ol className="mb-3 space-y-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  <li>
                    <b className="text-foreground">1.</b> OBS → <b>Settings → Stream</b>.
                  </li>
                  <li>
                    <b className="text-foreground">2.</b> <b>Service: Custom…</b> and{" "}
                    paste <b>Server: RTMP URL</b>. Turn <b>Enhanced Broadcasting</b> off — that fixes
                    “No config URL available”.
                  </li>
                  <li>
                    <b className="text-foreground">3.</b> Paste the <b>Stream Key</b>. Leave “Use
                    authentication” off.
                  </li>
                  <li>
                    <b className="text-foreground">4.</b> OBS → <b>Settings → Output</b> → Output Mode{" "}
                    <b>Simple</b>, Encoder <b>Software (x264)</b>, Bitrate <b>4000</b>.
                  </li>
                  <li>
                    <b className="text-foreground">5.</b> OBS → <b>Settings → Video</b> → Base and
                    Output <b>1280×720</b>, FPS <b>30</b>.
                  </li>
                  <li>
                    <b className="text-foreground">6.</b> Click <b>Start Streaming</b> in OBS, then
                    tap <b>Check OBS Connection</b>.
                  </li>
                </ol>

                <KeyRow
                  label="RTMP URL (Server) — primary, TLS"
                  value={profile.cf_rtmps_url || ""}
                  onCopy={() => copy(profile.cf_rtmps_url || "", "RTMP URL")}
                />
                <KeyRow
                  label="RTMP URL — fallback (no TLS, port 1935)"
                  value={rtmpFallbackUrl}
                  onCopy={() => copy(rtmpFallbackUrl, "RTMP fallback URL")}
                />
                <KeyRow
                  label="Stream Key"
                  value={
                    showKey
                      ? profile.cf_stream_key || ""
                      : "••••••••" + String(profile.cf_stream_key || "").slice(-6)
                  }
                  onCopy={() => copy(profile.cf_stream_key || "", "Stream key")}
                  rightSlot={
                    <button
                      onClick={() => setShowKey((s) => !s)}
                      className="rounded bg-muted px-2 py-1.5"
                      aria-label="toggle"
                    >
                      {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  }
                />

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => copy(profile.cf_rtmps_url || "", "Stream URL")}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground"
                  >
                    <Copy className="h-4 w-4" /> Copy Stream URL
                  </button>
                  <button
                    onClick={() => copy(profile.cf_stream_key || "", "Stream key")}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground"
                  >
                    <Copy className="h-4 w-4" /> Copy Stream Key
                  </button>
                  <button
                    data-tour="obs-download"
                    onClick={downloadProfile}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-muted px-3 py-3 text-sm font-bold"
                  >
                    <Download className="h-4 w-4" /> Download OBS Profile
                  </button>
                  <TestConnectionButton
                    health={health}
                    polling={polling}
                    onClick={() => checkConnection(true)}
                  />
                </div>

                <p className="mt-2 text-[10px] text-muted-foreground">
                  If OBS says “No config URL available”, you are not on Custom RTMP or Enhanced
                  Broadcasting is still enabled. If connection fails after that, try the non-TLS
                  fallback URL above.
                </p>
              </div>

              {/* Encoder fallback help — fixes "Starting the output failed" */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-amber-500">
                  <AlertCircle className="h-4 w-4" /> Got “Starting the output failed”?
                </p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  That message means OBS is trying to use a broken or unavailable hardware encoder.
                  Use <b>Software (x264)</b> first. If you prefer NVENC / AMD, update your video
                  drivers and select the matching hardware encoder after OBS starts successfully.
                </p>
                <ol className="space-y-1 rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">
                  <li>
                    <b className="text-foreground">1.</b> OBS → <b>Settings → Output</b>.
                  </li>
                  <li>
                    <b className="text-foreground">2.</b> Output Mode: <b>Simple</b>.
                  </li>
                  <li>
                    <b className="text-foreground">3.</b> <b>Encoder: Software (x264)</b>. Preset{" "}
                    <b>veryfast</b>.
                  </li>
                  <li>
                    <b className="text-foreground">4.</b> Video Bitrate <b>3500–4500</b> kbps. Audio{" "}
                    <b>160</b> kbps.
                  </li>
                  <li>
                    <b className="text-foreground">5.</b> Click <b>Apply → OK</b> and Start
                    Streaming again.
                  </li>
                </ol>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  If you have an NVIDIA GPU and want to use NVENC for lower CPU usage, update GPU
                  drivers first. Card-streaming setups don’t need NVENC — x264 at 720p30 uses very
                  little CPU.
                </p>
              </div>

              {/* Step 3: defaults */}
              <div className="rounded-2xl bg-card p-4 space-y-3">
                <p className="text-sm font-bold">Step 3 · Save your stream defaults</p>
                <p className="text-[11px] text-muted-foreground">
                  Set once — we reuse these every time you go live with OBS. No more typing the same
                  info.
                </p>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Default title
                  </p>
                  <input
                    value={profile.default_title || ""}
                    onChange={(e) => setProfile({ ...profile, default_title: e.target.value })}
                    onBlur={(e) => saveDefaults({ default_title: e.target.value })}
                    placeholder="e.g. Friday Night Pokémon Auctions"
                    maxLength={80}
                    className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Default category
                  </p>
                  <select
                    value={profile.default_category || "pokemon"}
                    onChange={(e) => saveDefaults({ default_category: e.target.value })}
                    className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none"
                  >
                    {LISTING_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    TCG tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TCG_TAGS.map((t) => {
                      const on = (profile.default_tcg_tags || []).includes(t.value);
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => {
                            const next = on
                              ? profile.default_tcg_tags.filter((x) => x !== t.value)
                              : [...(profile.default_tcg_tags || []), t.value as TcgTag];
                            saveDefaults({ default_tcg_tags: next });
                          }}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          {t.emoji} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Stream type
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { v: "auction", label: "🏷️ Auction" },
                      { v: "break", label: "📦 Break" },
                      { v: "rip_ship", label: "✂️ Rip & Ship" },
                      { v: "showcase", label: "🏆 Showcase" },
                    ].map((s) => (
                      <button
                        key={s.v}
                        onClick={() => saveDefaults({ default_stream_type: s.v })}
                        className={`rounded-lg px-2 py-2 text-xs font-bold ${profile.default_stream_type === s.v ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 4: go live */}
              <div className="rounded-2xl border border-live/30 bg-live/5 p-4">
                <p className="text-sm font-bold">Step 4 · Go Live with OBS</p>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Open OBS → Start Streaming → tap below. We launch your stream with your saved
                  defaults — no extra prompts.
                </p>

                {/* Pre-flight checklist */}
                <ul className="mb-3 space-y-1 rounded-xl bg-background/40 p-3 text-[11px]">
                  <PreflightItem ok={preflight.streamKey} label="Stream key generated" />
                  <PreflightItem ok={preflight.rtmpUrl} label="RTMP URL ready" />
                  <PreflightItem ok={preflight.title} label="Default stream title set" />
                  <PreflightItem ok={preflight.tags} label="At least one TCG tag selected" />
                  <PreflightItem
                    ok={preflight.encoderConnected}
                    label="OBS encoder connected (optional — can start before)"
                    optional
                  />
                </ul>

                <button
                  onClick={goLiveWithObs}
                  disabled={launching || !preflightReady}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-live py-3 text-sm font-bold text-live-foreground disabled:opacity-50"
                >
                  {launching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  🔴 Go Live With OBS
                </button>
                {!preflightReady && (
                  <p className="mt-2 text-[10px] text-amber-500">
                    Finish the items above first — then this button unlocks.
                  </p>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Prefer mobile?{" "}
                  <Link to="/sell" className="text-primary underline">
                    Use mobile camera instead →
                  </Link>
                </p>
              </div>

              {/* Beginner mode */}
              <Link
                to="/sell"
                className="block rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4 hover:bg-fuchsia-500/10"
              >
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
                  <Smartphone className="h-4 w-4 text-fuchsia-400" /> Beginner mode — no OBS needed
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Stream straight from your phone or laptop camera. Tap here to use the guided
                  6-step setup — go live in under 2 minutes.
                </p>
                <span className="mt-2 inline-block rounded-full bg-fuchsia-500 px-2.5 py-1 text-[10px] font-bold text-white">
                  Start with phone camera →
                </span>
              </Link>

              {/* Stream health */}
              <HealthCard health={health} polling={polling} />

              {/* Method picker */}
              <div className="rounded-2xl bg-card p-4">
                <p className="mb-2 text-sm font-bold">Streaming method</p>
                <div className="grid grid-cols-2 gap-2">
                  <MethodTile
                    active={profile.preferred_method === "obs"}
                    icon={<Monitor className="h-4 w-4" />}
                    label="OBS desktop"
                    hint="Pro encoder, overlays"
                    onClick={() => saveDefaults({ preferred_method: "obs" })}
                  />
                  <MethodTile
                    active={profile.preferred_method === "mobile"}
                    icon={<Smartphone className="h-4 w-4" />}
                    label="Mobile camera"
                    hint="Tap-and-go from your phone"
                    onClick={() => {
                      saveDefaults({ preferred_method: "mobile" });
                      nav({ to: "/sell" });
                    }}
                  />
                </div>
              </div>

              {/* Future / coming-soon section */}
              <div className="rounded-2xl bg-card p-4">
                <p className="mb-2 text-sm font-bold">Coming soon</p>
                <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
                  <li className="rounded-lg bg-muted px-2 py-1.5">🪄 Overlays & alerts</li>
                  <li className="rounded-lg bg-muted px-2 py-1.5">🎥 Multi-camera</li>
                  <li className="rounded-lg bg-muted px-2 py-1.5">🤝 Collab guests</li>
                  <li className="rounded-lg bg-muted px-2 py-1.5">✨ Flex Live integration</li>
                  <li className="rounded-lg bg-muted px-2 py-1.5">🎬 Scene switching</li>
                  <li className="rounded-lg bg-muted px-2 py-1.5">📊 Stream analytics</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </SellerAgreementGate>
  );
}

function StatusPill({
  profile,
  health,
  polling,
}: {
  profile: ObsProfile | null;
  health: Health | null;
  polling: boolean;
}) {
  let label = "Not connected";
  let icon = <WifiOff className="h-3.5 w-3.5" />;
  let cls = "bg-muted text-muted-foreground";
  if (profile?.cf_stream_key) {
    if (health?.status === "live") {
      label = "Live";
      cls = "bg-live/20 text-live";
      icon = <Activity className="h-3.5 w-3.5 animate-pulse" />;
    } else if (health?.status === "reconnecting") {
      label = "Reconnecting";
      cls = "bg-amber-500/20 text-amber-500";
      icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
    } else if (health?.status === "connected") {
      label = "Connected";
      cls = "bg-emerald-500/20 text-emerald-500";
      icon = <CheckCircle2 className="h-3.5 w-3.5" />;
    } else {
      label = "Offline (ready)";
      cls = "bg-primary/20 text-primary";
      icon = <Wifi className="h-3.5 w-3.5" />;
    }
  }
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${cls}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold">
        {icon} {label}
      </span>
      {polling && <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />}
    </div>
  );
}

function HealthCard({ health, polling }: { health: Health | null; polling: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">Stream health</p>
        {polling && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {!health || health.status === "offline" ? (
        <p className="text-[11px] text-muted-foreground">
          Waiting for OBS to connect. Hit <b>Start Streaming</b> in OBS — we'll detect it
          automatically.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat
            label="Bitrate"
            value={health.bitrateKbps != null ? `${health.bitrateKbps} kbps` : "—"}
          />
          <Stat label="FPS" value={health.fps != null ? String(health.fps) : "—"} />
          <Stat
            label="Resolution"
            value={health.width && health.height ? `${health.width}×${health.height}` : "—"}
          />
          <Stat
            label="Dropped"
            value={health.droppedFrames != null ? String(health.droppedFrames) : "—"}
          />
          <Stat
            label="Quality"
            value={
              health.bitrateKbps == null
                ? "—"
                : health.bitrateKbps >= 3500
                  ? "Great"
                  : health.bitrateKbps >= 2000
                    ? "Good"
                    : "Poor"
            }
          />
          <Stat label="Status" value={health.status} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-bold">{value}</p>
    </div>
  );
}

function TestConnectionButton({
  health,
  polling,
  onClick,
}: {
  health: Health | null;
  polling: boolean;
  onClick: () => void;
}) {
  const ok = health?.status === "connected" || health?.status === "live";
  if (ok) {
    return (
      <button
        onClick={onClick}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-3 text-sm font-bold text-emerald-500"
      >
        <CheckCircle2 className="h-4 w-4" /> Connected
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={polling}
      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 py-3 text-sm font-bold text-muted-foreground disabled:opacity-60"
    >
      {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
      Check OBS Connection
    </button>
  );
}

function KeyRow({
  label,
  value,
  onCopy,
  rightSlot,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-[10px]">{value}</code>
        <button onClick={onCopy} className="rounded bg-muted px-2 py-1.5">
          <Copy className="h-3 w-3" />
        </button>
        {rightSlot}
      </div>
    </div>
  );
}

function PreflightItem({
  ok,
  label,
  optional,
}: {
  ok: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle
          className={`h-3.5 w-3.5 shrink-0 ${optional ? "text-muted-foreground" : "text-amber-500"}`}
        />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {optional && !ok ? " — optional" : ""}
      </span>
    </li>
  );
}

function MethodTile({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold">
        {icon} {label}
      </div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
      {active && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
          <CheckCircle2 className="h-2.5 w-2.5" /> Selected
        </span>
      )}
    </button>
  );
}

function makeStoredZip(files: Record<string, string>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centralParts.length, true);
  ev.setUint16(10, centralParts.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const size = offset + centralSize + end.length;
  const out = new Uint8Array(size);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out.buffer.slice(0);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
