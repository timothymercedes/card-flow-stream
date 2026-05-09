import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStudio, type StudioScene } from "@/hooks/useStudio";
import { toast } from "sonner";
import {
  Camera, Monitor, Mic, MicOff, Eye, EyeOff, Trash2, Radio,
  Layout, Square, SplitSquareHorizontal, PictureInPicture, Grid2X2,
  Plus, ChevronDown, AlertCircle, Loader2, StopCircle, Users,
} from "lucide-react";

export const Route = createFileRoute("/studio/$id")({
  head: () => ({ meta: [{ title: "Studio — PullBidLive" }] }),
  component: Studio,
});

type Stream = {
  id: string;
  seller_id: string;
  title: string;
  status: string;
  cf_whip_url: string | null;
  cf_playback_hls: string | null;
};

function Studio() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [endingLive, setEndingLive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load stream
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("live_streams")
        .select("id, seller_id, title, status, cf_whip_url, cf_playback_hls")
        .eq("id", id)
        .maybeSingle();
      if (!active) return;
      setStream((data as any) || null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  const studio = useStudio({
    whipUrl: stream?.cf_whip_url ?? null,
    autoPublish: true,
  });

  // Mirror canvas to a visible <video>
  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!studio.canvas || !previewRef.current) return;
    const stream = studio.canvas.captureStream(30);
    previewRef.current.srcObject = stream;
    previewRef.current.play().catch(() => {});
  }, [studio.canvas]);

  // NOTE: do NOT auto-call getUserMedia on mount. Most browsers (Safari/iOS
  // especially) require a direct user gesture or the request fails silently.
  // The user starts their camera by tapping the button in the empty state.

  async function endLive() {
    if (!stream) return;
    setEndingLive(true);
    studio.stopPublish();
    await supabase
      .from("live_streams")
      .update({ status: "ended", is_active: false, ended_at: new Date().toISOString() })
      .eq("id", stream.id);
    setEndingLive(false);
    toast.success("Stream ended");
    nav({ to: "/store" });
  }

  if (loading) {
    return <AppShell><div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading studio…</div></AppShell>;
  }
  if (!stream || !user || stream.seller_id !== user.id) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Studio not found or you don&apos;t own this stream.</p>
          <Link to="/obs-hub" className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to Streamer Hub</Link>
        </div>
      </AppShell>
    );
  }

  const scenes: { id: StudioScene; label: string; Icon: typeof Square }[] = [
    { id: "solo", label: "Solo", Icon: Square },
    { id: "split", label: "Split", Icon: SplitSquareHorizontal },
    { id: "pip", label: "PiP", Icon: PictureInPicture },
    { id: "grid", label: "Grid", Icon: Grid2X2 },
  ];

  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{stream.title}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${studio.publishing ? "bg-live/20 text-live" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${studio.publishing ? "bg-live animate-pulse" : "bg-muted-foreground"}`} />
                {studio.publishing ? "BROADCASTING" : "Preparing"}
              </span>
              <Link to="/live/$id" params={{ id: stream.id }} className="underline underline-offset-2">View public page</Link>
            </div>
          </div>
          <button
            onClick={endLive}
            disabled={endingLive}
            className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
          >
            {endingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
            End Live
          </button>
        </div>

        {/* Live preview */}
        <div className="overflow-hidden rounded-2xl border border-border bg-black">
          <video ref={previewRef} className="aspect-video w-full bg-black" muted playsInline autoPlay />
        </div>

        {/* Scene switcher */}
        <div className="rounded-2xl bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
            <Layout className="h-3.5 w-3.5" /> Scene
          </div>
          <div className="grid grid-cols-4 gap-2">
            {scenes.map(({ id: sid, label, Icon }) => (
              <button
                key={sid}
                onClick={() => studio.setScene(sid)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-[11px] font-semibold transition ${studio.scene === sid ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div className="rounded-2xl bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Users className="h-3.5 w-3.5" /> Sources ({studio.sources.length})
            </div>
            <div className="relative">
              <button
                onClick={() => setPickerOpen((s) => !s)}
                className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground"
              >
                <Plus className="h-3 w-3" /> Add source <ChevronDown className="h-3 w-3" />
              </button>
              {pickerOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                  <button
                    onClick={async () => { setPickerOpen(false); await studio.addCamera(); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted"
                  >
                    <Camera className="h-3.5 w-3.5" /> Default camera
                  </button>
                  {studio.cameraDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      onClick={async () => { setPickerOpen(false); await studio.addCamera(d.deviceId); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted"
                    >
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</span>
                    </button>
                  ))}
                  <div className="border-t border-border" />
                  <button
                    onClick={async () => { setPickerOpen(false); await studio.addScreen(); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted"
                  >
                    <Monitor className="h-3.5 w-3.5" /> Share screen / window
                  </button>
                </div>
              )}
            </div>
          </div>

          {studio.sources.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Your browser will ask for camera & mic permission. Click below to start.
              </p>
              <button
                onClick={async () => { await studio.addCamera(); }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                <Camera className="h-4 w-4" /> Enable camera
              </button>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  onClick={async () => { await studio.addScreen(); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-semibold hover:bg-muted/70"
                >
                  <Monitor className="h-3 w-3" /> Share screen
                </button>
              </div>
              {studio.cameraDevices.length > 0 && (
                <p className="pt-1 text-[10px] text-muted-foreground">
                  {studio.cameraDevices.length} camera{studio.cameraDevices.length === 1 ? "" : "s"} detected. Use <b>Add source</b> above to pick a specific one.
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {studio.sources.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${studio.activeId === s.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  <button
                    onClick={() => studio.setActiveId(s.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                    title="Set as featured"
                  >
                    {s.kind === "camera" ? <Camera className="h-4 w-4 shrink-0" /> : <Monitor className="h-4 w-4 shrink-0" />}
                    <span className="truncate text-xs font-semibold">{s.label}</span>
                    {studio.activeId === s.id && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">Featured</span>}
                  </button>
                  <button
                    onClick={() => studio.toggleMute(s.id)}
                    className="rounded-lg p-1.5 hover:bg-muted"
                    title={s.muted ? "Unmute" : "Mute"}
                  >
                    {s.muted ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => studio.toggleVisible(s.id)}
                    className="rounded-lg p-1.5 hover:bg-muted"
                    title={s.visible ? "Hide" : "Show"}
                  >
                    {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={() => studio.removeSource(s.id)}
                    className="rounded-lg p-1.5 hover:bg-destructive/10"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status / errors */}
        {studio.error && (
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">{studio.error}</div>
            <button onClick={studio.clearError} className="font-bold underline">Dismiss</button>
          </div>
        )}

        <p className="px-2 text-center text-[10px] text-muted-foreground">
          <Radio className="inline h-3 w-3" /> Stream is published directly from this browser to PullBidLive. Keep this tab open while live.
        </p>
      </div>
    </AppShell>
  );
}
