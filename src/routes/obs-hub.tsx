import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Radio, Copy, Download, RefreshCw, Activity, Wifi, WifiOff,
  Smartphone, Monitor, Eye, EyeOff, Play, CheckCircle2, AlertCircle, Loader2,
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
  const pollRef = useRef<number | null>(null);

  useEffect(() => { triggerOnce("obs-connect"); }, [triggerOnce]);

  // Load OBS profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("obs_profiles" as any)
        .select("*").eq("user_id", user.id).maybeSingle();
      setProfile((data as any) || null);
      setLoading(false);
    })();
  }, [user]);

  // Poll Cloudflare lifecycle every 6s once we have a live input
  useEffect(() => {
    if (!profile?.cf_live_input_id) return;
    let cancelled = false;
    const tick = async () => {
      setPolling(true);
      const { data, error } = await supabase.functions.invoke("obs-status", {
        body: { live_input_id: profile.cf_live_input_id },
      });
      if (!cancelled) {
        if (!error && data) setHealth(data as Health);
        setPolling(false);
      }
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
    const { data, error } = await supabase.functions.invoke("create-stream-input", {
      body: { meta_name: `OBS Hub — ${user.id.slice(0, 6)}` },
    });
    if (error || (data as any)?.error) {
      setProvisioning(false);
      return toast.error("Could not provision OBS — Cloudflare keys missing");
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
    const { data: up, error: upErr } = await supabase.from("obs_profiles" as any)
      .upsert(row).select().single();
    setProvisioning(false);
    if (upErr) return toast.error(upErr.message);
    setProfile(up as any);
    toast.success("OBS profile ready — copy keys or download .ini");
  }

  async function saveDefaults(patch: Partial<ObsProfile>) {
    if (!user || !profile) return;
    const merged = { ...profile, ...patch };
    setProfile(merged);
    await supabase.from("obs_profiles" as any).update(patch).eq("user_id", user.id);
  }

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  function downloadProfile() {
    if (!profile?.cf_rtmps_url || !profile?.cf_stream_key) return;
    const ini = `[General]\nName=PullBidLive\n\n[Stream]\nservice=Custom\nserver=${profile.cf_rtmps_url}\nkey=${profile.cf_stream_key}\nuse_auth=false\n\n[Output]\nMode=Simple\n\n[SimpleOutput]\nVBitrate=4500\nABitrate=160\nStreamEncoder=x264\n\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSCommon=30\n`;
    const blob = new Blob([ini], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "PullBidLive.ini";
    a.click(); URL.revokeObjectURL(url);
    toast.success("Profile downloaded — OBS → Profile → Import");
  }

  async function goLiveWithObs() {
    if (!user || !profile) return;
    if (!profile.default_title?.trim()) return toast.error("Set a stream title in your saved defaults");
    if (!profile.default_tcg_tags?.length) return toast.error("Pick at least one TCG tag");
    setLaunching(true);
    // Block if already open
    const { data: open } = await supabase.from("live_streams")
      .select("id, mode").eq("seller_id", user.id).in("status", ["live", "paused"]).maybeSingle();
    if (open) {
      setLaunching(false);
      toast.error("You already have an open stream — end it first");
      return nav({ to: "/live/$id", params: { id: open.id } });
    }
    const { data, error } = await supabase.from("live_streams").insert({
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
      cf_live_input_id: profile.cf_live_input_id,
      cf_rtmps_url: profile.cf_rtmps_url,
      cf_stream_key: profile.cf_stream_key,
      cf_playback_hls: profile.cf_playback_hls,
      cf_whip_url: profile.cf_whip_url,
    }).select().single();
    setLaunching(false);
    if (error) return toast.error(error.message);
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  if (!user) {
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">OBS Streamer Hub</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to set up OBS.</p>
          <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <SellerAgreementGate>
    <AppShell>
      <div className="space-y-4 px-4 py-4">
        <header className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">OBS Streamer Hub</h1>
        </header>
        <p className="text-xs text-muted-foreground">
          One central place to connect OBS, save your defaults, and go live in under a minute.
        </p>

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
              Tap below — we generate a permanent RTMPS URL and stream key you can save in OBS once and reuse forever.
            </p>
            <button
              onClick={provision}
              disabled={provisioning}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
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
                  className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold"
                  title="Generate a fresh stream key"
                >
                  <RefreshCw className="h-3 w-3" /> Rotate
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  onClick={downloadProfile}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> Download .ini
                </button>
                <button
                  onClick={() => copy(`Server: ${profile.cf_rtmps_url}\nStream Key: ${profile.cf_stream_key}`, "Server + key")}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-muted py-2 text-xs font-bold"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy both
                </button>
              </div>

              <KeyRow label="Server (RTMPS)" value={profile.cf_rtmps_url || ""} onCopy={() => copy(profile.cf_rtmps_url || "", "Server")} />
              <KeyRow
                label="Stream Key"
                value={showKey ? (profile.cf_stream_key || "") : "••••••••" + String(profile.cf_stream_key || "").slice(-6)}
                onCopy={() => copy(profile.cf_stream_key || "", "Stream key")}
                rightSlot={
                  <button onClick={() => setShowKey((s) => !s)} className="rounded bg-muted px-2 py-1" aria-label="toggle">
                    {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                }
              />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Recommended: 1080p · 30fps · 4500 kbps · keyframe 2s · x264.
              </p>
            </div>

            {/* Step 3: defaults */}
            <div className="rounded-2xl bg-card p-4 space-y-3">
              <p className="text-sm font-bold">Step 3 · Save your stream defaults</p>
              <p className="text-[11px] text-muted-foreground">Set once — we reuse these every time you go live with OBS. No more typing the same info.</p>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Default title</p>
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
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Default category</p>
                <select
                  value={profile.default_category || "pokemon"}
                  onChange={(e) => saveDefaults({ default_category: e.target.value })}
                  className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none"
                >
                  {LISTING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                </select>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">TCG tags</p>
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
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stream type</p>
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
                Open OBS → Start Streaming → tap below. We launch your stream with your saved defaults — no extra prompts.
              </p>
              <button
                onClick={goLiveWithObs}
                disabled={launching}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-live py-3 text-sm font-bold text-live-foreground disabled:opacity-50"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                🔴 Go Live With OBS
              </button>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Prefer mobile? <Link to="/sell" className="text-primary underline">Use mobile camera instead →</Link>
              </p>
            </div>

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
                  onClick={() => { saveDefaults({ preferred_method: "mobile" }); nav({ to: "/sell" }); }}
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

function StatusPill({ profile, health, polling }: { profile: ObsProfile | null; health: Health | null; polling: boolean }) {
  let label = "Not connected";
  let icon = <WifiOff className="h-3.5 w-3.5" />;
  let cls = "bg-muted text-muted-foreground";
  if (profile?.cf_stream_key) {
    if (health?.status === "live") { label = "Live"; cls = "bg-live/20 text-live"; icon = <Activity className="h-3.5 w-3.5 animate-pulse" />; }
    else if (health?.status === "reconnecting") { label = "Reconnecting"; cls = "bg-amber-500/20 text-amber-500"; icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" />; }
    else if (health?.status === "connected") { label = "Connected"; cls = "bg-emerald-500/20 text-emerald-500"; icon = <CheckCircle2 className="h-3.5 w-3.5" />; }
    else { label = "Offline (ready)"; cls = "bg-primary/20 text-primary"; icon = <Wifi className="h-3.5 w-3.5" />; }
  }
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${cls}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold">{icon} {label}</span>
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
          Waiting for OBS to connect. Hit <b>Start Streaming</b> in OBS — we'll detect it automatically.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Bitrate" value={health.bitrateKbps != null ? `${health.bitrateKbps} kbps` : "—"} />
          <Stat label="FPS" value={health.fps != null ? String(health.fps) : "—"} />
          <Stat label="Resolution" value={health.width && health.height ? `${health.width}×${health.height}` : "—"} />
          <Stat label="Dropped" value={health.droppedFrames != null ? String(health.droppedFrames) : "—"} />
          <Stat
            label="Quality"
            value={
              health.bitrateKbps == null ? "—" :
              health.bitrateKbps >= 3500 ? "Great" :
              health.bitrateKbps >= 2000 ? "Good" : "Poor"
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

function KeyRow({ label, value, onCopy, rightSlot }: { label: string; value: string; onCopy: () => void; rightSlot?: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-[10px]">{value}</code>
        <button onClick={onCopy} className="rounded bg-muted px-2 py-1.5"><Copy className="h-3 w-3" /></button>
        {rightSlot}
      </div>
    </div>
  );
}

function MethodTile({ active, icon, label, hint, onClick }: { active: boolean; icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold">{icon} {label}</div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
      {active && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary"><CheckCircle2 className="h-2.5 w-2.5" /> Selected</span>}
    </button>
  );
}
