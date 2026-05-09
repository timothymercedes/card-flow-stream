import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStudio, type StudioScene } from "@/hooks/useStudio";
import { toast } from "sonner";
import {
  Camera, Monitor, Mic, MicOff, Eye, EyeOff, Trash2, Radio,
  Layout, Square, SplitSquareHorizontal, PictureInPicture, Grid2X2,
  Plus, ChevronDown, AlertCircle, Loader2, StopCircle, Users,
  Move, Maximize2, Minimize2, RotateCcw, Lock, Unlock, Pencil,
  Save, Magnet, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Wand2, Gift, Scan, Repeat, ExternalLink, Smartphone, Copy, X, RefreshCw,
} from "lucide-react";
import { FreeformOverlay } from "@/components/FreeformOverlay";
import { StudioChatDock } from "@/components/StudioChatDock";
import { usePhoneCamera } from "@/hooks/usePhoneCamera";
import QRCode from "qrcode";

export const Route = createFileRoute("/studio/$id")({
  head: () => ({ meta: [{ title: "Live Studio — PullBidLive" }] }),
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
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [scanningCameras, setScanningCameras] = useState(false);
  const [queuedCameraIds, setQueuedCameraIds] = useState<string[]>([]);

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
    storageKey: id,
  });

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(`studio:${id}:cameraDeviceIds`);
      setQueuedCameraIds(raw ? (JSON.parse(raw) as string[]).filter(Boolean).slice(0, 3) : []);
    } catch {
      setQueuedCameraIds([]);
    }
  }, [id]);

  // Auto-start cameras pre-selected on /sell so the cockpit doesn't ask again.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (queuedCameraIds.length === 0) return;
    autoStartedRef.current = true;
    (async () => {
      let added = 0;
      for (const deviceId of queuedCameraIds) {
        try {
          const addedId = await studio.addCamera(deviceId);
          if (addedId) added += 1;
        } catch {}
      }
      window.sessionStorage.removeItem(`studio:${id}:cameraDeviceIds`);
      setQueuedCameraIds([]);
      if (added > 0) toast.success(`${added} camera${added === 1 ? "" : "s"} ready`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCameraIds.join(",")]);

  // Phone-as-camera signaling
  const phone = usePhoneCamera({
    streamId: id,
    onStream: (s, label) => {
      studio.addExternalStream(s, label, "phone");
      toast.success("Phone camera connected");
    },
  });
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!phone.joinUrl) { setQrDataUrl(null); return; }
    QRCode.toDataURL(phone.joinUrl, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [phone.joinUrl]);

  // Right rail tab
  const [rightTab, setRightTab] = useState<"chat" | "info">("chat");

  // Mirror canvas to a visible <video>
  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!studio.canvas || !previewRef.current) return;
    const s = studio.canvas.captureStream(30);
    previewRef.current.srcObject = s;
    previewRef.current.play().catch(() => {});
  }, [studio.canvas]);

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

  // Camera switcher: cycle featured camera
  const cameras = useMemo(() => studio.sources.filter((s) => s.kind === "camera"), [studio.sources]);
  function cycleCamera() {
    if (cameras.length === 0) return;
    const idx = cameras.findIndex((c) => c.id === studio.activeId);
    const next = cameras[(idx + 1) % cameras.length];
    studio.setActiveId(next.id);
    toast.success(`Switched to ${next.label}`);
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
    { id: "grid", label: "Grid", Icon: Grid2X2 },
    { id: "freeform", label: "Free", Icon: Move },
  ];

  const MAX_CAMERAS = 3;
  const cameraCount = cameras.length;
  const camerasFull = cameraCount >= MAX_CAMERAS;
  const cameraAccessNeeded = studio.cameraDevices.length === 0 || studio.cameraDevices.some((d) => !d.label);

  async function scanCameras() {
    setScanningCameras(true);
    const devices = cameraAccessNeeded ? await studio.requestCameraPermission() : await studio.refreshDevices();
    setScanningCameras(false);
    if (devices.length > 0) toast.success(`${devices.length} camera${devices.length === 1 ? "" : "s"} found`);
  }

  async function startQueuedCameras() {
    if (queuedCameraIds.length === 0) return;
    setScanningCameras(true);
    let added = 0;
    for (const deviceId of queuedCameraIds) {
      const addedId = await studio.addCamera(deviceId);
      if (addedId) added += 1;
    }
    window.sessionStorage.removeItem(`studio:${id}:cameraDeviceIds`);
    setQueuedCameraIds([]);
    setScanningCameras(false);
    if (added > 0) toast.success(`${added} camera${added === 1 ? "" : "s"} added to studio`);
  }

  // Compact source row with full OBS controls
  function SourceRow({ s }: { s: typeof studio.sources[number] }) {
    const isFeatured = studio.activeId === s.id;
    return (
      <li className={`group rounded-lg border p-1.5 ${isFeatured ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
        <div className="flex items-center gap-1">
          {s.kind === "camera" ? <Camera className="h-3.5 w-3.5 shrink-0" /> : <Monitor className="h-3.5 w-3.5 shrink-0" />}
          {renamingId === s.id ? (
            <input
              autoFocus
              defaultValue={s.label}
              onBlur={(e) => { studio.renameSource(s.id, e.currentTarget.value); setRenamingId(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { studio.renameSource(s.id, (e.target as HTMLInputElement).value); setRenamingId(null); }
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="flex-1 min-w-0 rounded bg-background px-1 text-[11px] font-semibold outline-none ring-1 ring-primary"
            />
          ) : (
            <button onClick={() => studio.setActiveId(s.id)} className="flex-1 min-w-0 truncate text-left text-[11px] font-semibold" title="Set as featured">
              {s.label}
              {isFeatured && <span className="ml-1 rounded bg-primary px-1 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">★</span>}
            </button>
          )}
          <button onClick={() => setRenamingId(s.id)} className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted" title="Rename"><Pencil className="h-3 w-3" /></button>
        </div>
        <div className="mt-1 flex items-center gap-0.5">
          <button onClick={() => studio.toggleVisible(s.id)} className="rounded p-1 hover:bg-muted" title={s.visible ? "Hide" : "Show"}>
            {s.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
          </button>
          <button onClick={() => studio.toggleLock(s.id)} className="rounded p-1 hover:bg-muted" title={s.locked ? "Unlock" : "Lock"}>
            {s.locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}
          </button>
          <button onClick={() => studio.toggleMute(s.id)} className="rounded p-1 hover:bg-muted" title={s.muted ? "Unmute" : "Mute"}>
            {s.muted ? <MicOff className="h-3 w-3 text-destructive" /> : <Mic className="h-3 w-3" />}
          </button>
          <select
            value={s.fit}
            onChange={(e) => studio.setFit(s.id, e.target.value as "cover" | "contain")}
            className="ml-auto rounded bg-muted px-1 py-0.5 text-[9px] font-semibold"
            title="Fit mode"
          >
            <option value="cover">Fill</option>
            <option value="contain">Fit</option>
          </select>
          <button onClick={() => studio.expandSource(s.id)} className="rounded p-1 hover:bg-muted" title="Fullscreen">
            {studio.expandedId === s.id ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button onClick={() => studio.removeSource(s.id)} className="rounded p-1 hover:bg-destructive/10" title="Remove">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </li>
    );
  }

  function AddSourceMenu() {
    return (
      <div className="relative">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground"
        >
          <Plus className="h-3 w-3" /> Add source <ChevronDown className="h-3 w-3" />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-popover shadow-lg">
            <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Cameras ({cameraCount}/{MAX_CAMERAS})
            </div>
            <button
              onClick={scanCameras}
              disabled={scanningCameras}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-primary hover:bg-muted disabled:opacity-50"
            >
              {scanningCameras ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {cameraAccessNeeded ? "Allow camera access + scan USB cameras" : "Refresh camera list"}
            </button>
            <button
              disabled={camerasFull}
              onClick={async () => { setPickerOpen(false); await studio.addCamera(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" /> Default camera
            </button>
            {studio.cameraDevices.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">
                No cameras listed yet. Click scan, allow permission, then pick each USB camera you want to add.
              </div>
            )}
            {studio.cameraDevices.map((d, i) => {
              const alreadyAdded = !!d.deviceId && studio.sources.some((s) => s.kind === "camera" && s.deviceId === d.deviceId);
              return (
                <button
                  key={`${d.deviceId || d.groupId || "camera"}-${i}`}
                  disabled={camerasFull || alreadyAdded}
                  onClick={async () => { setPickerOpen(false); await studio.addCamera(d.deviceId); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{d.label || `Camera ${d.deviceId ? d.deviceId.slice(0, 6) : "permission needed"}`}</span>
                  {alreadyAdded && <span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground">Added</span>}
                </button>
              );
            })}
            <div className="border-t border-border" />
            <button
              onClick={async () => { setPickerOpen(false); await studio.addScreen(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <Monitor className="h-3.5 w-3.5" /> Share screen / window
            </button>
            <button
              onClick={() => {
                setPickerOpen(false);
                if (!phone.token) phone.startSession();
                setPhoneOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <Smartphone className="h-3.5 w-3.5" /> Phone as camera (QR)
            </button>
            <div className="border-t border-border bg-muted/30 px-3 py-2 text-[9px] text-muted-foreground">
              Tip: USB and OBS Virtual Camera show up as regular cameras.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background lg:h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setLeftOpen((v) => !v)}
              className="hidden rounded-lg p-1.5 hover:bg-muted lg:inline-flex"
              title={leftOpen ? "Hide left panel" : "Show left panel"}
            >
              {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{stream.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${studio.publishing ? "bg-live/20 text-live" : "bg-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${studio.publishing ? "bg-live animate-pulse" : "bg-muted-foreground"}`} />
                  {studio.publishing ? "LIVE" : "Preparing"}
                </span>
                <Link to="/live/$id" params={{ id: stream.id }} className="inline-flex items-center gap-0.5 underline underline-offset-2">
                  Public page <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRightOpen((v) => !v)}
              className="hidden rounded-lg p-1.5 hover:bg-muted lg:inline-flex"
              title={rightOpen ? "Hide right panel" : "Show right panel"}
            >
              {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
            <button
              onClick={endLive}
              disabled={endingLive}
              className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
            >
              {endingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
              End Live
            </button>
          </div>
        </div>

        {/* Main grid: 3-column on desktop, stacked on mobile */}
        <div
          className="flex-1 min-h-0 overflow-hidden lg:grid"
          style={{
            gridTemplateColumns:
              `${leftOpen ? "280px" : "0px"} 1fr ${rightOpen ? "320px" : "0px"}`,
            transition: "grid-template-columns 0.2s",
          }}
        >
          {/* LEFT RAIL */}
          <aside className={`flex flex-col gap-2 overflow-y-auto border-r border-border bg-card p-2 ${leftOpen ? "" : "lg:hidden"}`}>
            {/* Sources */}
            <section className="rounded-xl bg-background p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-[11px] font-bold">
                  <Users className="h-3 w-3" /> Sources
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{cameraCount}/{MAX_CAMERAS}</span>
                </h3>
              </div>
              <AddSourceMenu />
              {studio.sources.length === 0 ? (
                <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Click <b>Add source</b> to enable your camera.</p>
                </div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {studio.sources.map((s) => <SourceRow key={s.id} s={s} />)}
                </ul>
              )}
            </section>

            {/* Scenes */}
            <section className="rounded-xl bg-background p-2">
              <h3 className="mb-1.5 flex items-center gap-1 text-[11px] font-bold">
                <Layout className="h-3 w-3" /> Scene layout
              </h3>
              <div className="grid grid-cols-4 gap-1">
                {scenes.map(({ id: sid, label, Icon }) => (
                  <button
                    key={sid}
                    onClick={() => studio.setScene(sid)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[9px] font-semibold ${studio.scene === sid ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
              {studio.scene === "freeform" && (
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    onClick={() => studio.setSnapEnabled(!studio.snapEnabled)}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${studio.snapEnabled ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                    title="Snap to grid"
                  >
                    <Magnet className="h-2.5 w-2.5" /> Snap
                  </button>
                  <button onClick={studio.resetLayouts} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold hover:bg-muted/70">
                    <RotateCcw className="h-2.5 w-2.5" /> Reset
                  </button>
                </div>
              )}
            </section>

            {/* Scene presets */}
            <section className="rounded-xl bg-background p-2">
              <h3 className="mb-1.5 flex items-center gap-1 text-[11px] font-bold">
                <Save className="h-3 w-3" /> Scene presets
              </h3>
              <button
                onClick={() => {
                  const name = window.prompt("Preset name:", `Scene ${studio.presets.length + 1}`);
                  if (name) { studio.savePreset(name); toast.success("Preset saved"); }
                }}
                className="w-full rounded-md bg-muted px-2 py-1 text-[10px] font-bold hover:bg-muted/70"
              >
                + Save current as preset
              </button>
              {studio.presets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {studio.presets.map((p) => (
                    <li key={p.id} className="flex items-center gap-1 rounded border border-border bg-background p-1">
                      <button onClick={() => { studio.loadPreset(p.id); toast.success(`Loaded ${p.name}`); }} className="flex-1 truncate text-left text-[10px] font-semibold hover:underline">
                        {p.name}
                      </button>
                      <button onClick={() => studio.deletePreset(p.id)} className="rounded p-0.5 hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* CENTER: LIVE CANVAS */}
          <main className="flex min-w-0 flex-col bg-black/95">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
              <div className="relative w-full max-w-[min(100%,calc((100vh-14rem)*16/9))]">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-2xl">
                  <video ref={previewRef} className="h-full w-full bg-black" muted playsInline autoPlay />
                  <FreeformOverlay
                    sources={studio.sources}
                    layouts={studio.layouts}
                    expandedId={studio.expandedId}
                    onInteractionStart={() => {
                      if (studio.scene !== "freeform") studio.setScene("freeform");
                    }}
                    onLayoutChange={(sid, patch) => {
                      if (studio.scene !== "freeform") studio.setScene("freeform");
                      studio.setLayout(sid, patch);
                    }}
                    onBringToFront={studio.bringToFront}
                    onSendToBack={studio.sendToBack}
                    onExpand={studio.expandSource}
                    onRemove={studio.removeSource}
                    onToggleLock={studio.toggleLock}
                    onToggleVisible={studio.toggleVisible}
                    onRename={studio.renameSource}
                  />
                  {studio.snapEnabled && studio.scene === "freeform" && (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 opacity-30"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.15) 1px, transparent 1px)",
                        backgroundSize: "5% 5%",
                      }}
                    />
                  )}
                  {studio.sources.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="pointer-events-auto rounded-2xl bg-card/90 p-4 text-center backdrop-blur">
                        <Camera className="mx-auto mb-2 h-8 w-8 text-primary" />
                        <p className="mb-2 text-sm font-bold">Live Studio ready</p>
                        <p className="mb-3 text-xs text-muted-foreground">Scan cameras, then add each USB/browser camera as its own source.</p>
                        <button
                          onClick={scanCameras}
                          disabled={scanningCameras}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                        >
                          {scanningCameras ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          Scan cameras
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                    {studio.publishing ? "🔴 BROADCASTING" : "Preview"} · what viewers see
                  </div>
                </div>
              </div>
            </div>

            {studio.error && (
              <div className="mx-2 mb-2 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">{studio.error}</div>
                <button onClick={studio.clearError} className="font-bold underline">Dismiss</button>
              </div>
            )}
          </main>

          {/* RIGHT RAIL */}
          <aside className={`flex min-h-0 flex-col gap-2 overflow-hidden border-l border-border bg-card p-2 ${rightOpen ? "" : "lg:hidden"}`}>
            <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-0.5">
              <button
                onClick={() => setRightTab("chat")}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold ${rightTab === "chat" ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                Chat
              </button>
              <button
                onClick={() => setRightTab("info")}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold ${rightTab === "info" ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                Info
              </button>
            </div>

            {rightTab === "chat" ? (
              <div className="flex min-h-0 flex-1">
                <StudioChatDock streamId={stream.id} />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                <section className="rounded-xl bg-background p-2">
                  <h3 className="mb-1.5 text-[11px] font-bold">Stream health</h3>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-bold">{studio.publishing ? "Broadcasting" : "Idle"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sources</span><span className="font-bold">{studio.sources.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cameras</span><span className="font-bold">{cameraCount}/{MAX_CAMERAS}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Scene</span><span className="font-bold capitalize">{studio.scene}</span></div>
                  </div>
                </section>

                <section className="rounded-xl bg-background p-2">
                  <h3 className="mb-1.5 text-[11px] font-bold">Quick controls</h3>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={scanCameras}
                      disabled={scanningCameras}
                      className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-muted p-2 text-[10px] font-bold hover:bg-muted/70 disabled:opacity-50"
                    >
                      {scanningCameras ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Scan USB/browser cameras
                    </button>
                    <button
                      onClick={cycleCamera}
                      disabled={cameras.length < 2}
                      className="flex flex-col items-center gap-0.5 rounded-lg bg-muted p-2 text-[10px] font-bold hover:bg-muted/70 disabled:opacity-50"
                    >
                      <Repeat className="h-3.5 w-3.5" /> Switch cam
                    </button>
                    <button
                      onClick={() => { if (studio.activeId) studio.expandSource(studio.activeId); }}
                      className="flex flex-col items-center gap-0.5 rounded-lg bg-muted p-2 text-[10px] font-bold hover:bg-muted/70"
                    >
                      <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
                    </button>
                    <button
                      onClick={() => { if (!phone.token) phone.startSession(); setPhoneOpen(true); }}
                      className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-primary p-2 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                    >
                      <Smartphone className="h-3.5 w-3.5" /> Pair phone camera
                    </button>
                  </div>
                </section>

                <Link
                  to="/live/$id"
                  params={{ id: stream.id }}
                  target="_blank"
                  className="flex items-center justify-center gap-1 rounded-lg bg-muted px-2 py-1.5 text-[11px] font-bold hover:bg-muted/70"
                >
                  <ExternalLink className="h-3 w-3" /> Open public live page
                </Link>

                <p className="px-1 text-center text-[9px] text-muted-foreground">
                  <Radio className="inline h-2.5 w-2.5" /> Streaming from this browser. Keep this tab open.
                </p>
              </div>
            )}
          </aside>
        </div>

        {/* BOTTOM CONTROL BAR */}
        <div className="border-t border-border bg-card px-2 py-2">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1.5">
            <BottomBtn
              icon={Mic}
              activeIcon={MicOff}
              active={studio.activeId ? studio.sources.find((s) => s.id === studio.activeId)?.muted : false}
              onClick={() => { if (studio.activeId) studio.toggleMute(studio.activeId); }}
              label={studio.activeId && studio.sources.find((s) => s.id === studio.activeId)?.muted ? "Unmute" : "Mute"}
            />
            <BottomBtn icon={Repeat} onClick={cycleCamera} label="Switch cam" disabled={cameras.length < 2} />
            <Divider />
            <BottomBtn icon={Wand2} onClick={() => toast.info("Open Auctions queue (coming soon)")} label="Auction" />
            <BottomBtn icon={Gift} onClick={() => toast.info("Open Giveaway (coming soon)")} label="Giveaway" />
            <BottomBtn icon={Scan} onClick={() => toast.info("Open Card scanner (coming soon)")} label="Scanner" />
            <Divider />
            <button
              onClick={endLive}
              disabled={endingLive}
              className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
            >
              {endingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
              End stream
            </button>
          </div>
        </div>
      </div>

      {/* PHONE-AS-CAMERA MODAL */}
      {phoneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <Smartphone className="h-4 w-4" /> Pair phone camera
              </h2>
              <button
                onClick={() => { setPhoneOpen(false); }}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Scan the QR code or open the link on your phone. Allow camera access — your phone&apos;s feed appears as a new source here.
            </p>
            {phone.joinUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center rounded-xl bg-white p-3">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Phone camera join QR" className="h-48 w-48" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-1 rounded-md bg-muted p-1.5">
                  <input
                    readOnly
                    value={phone.joinUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 min-w-0 bg-transparent text-[10px] outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(phone.joinUrl!);
                      toast.success("Link copied");
                    }}
                    className="rounded p-1 hover:bg-background"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2 py-1.5 text-[10px]">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-bold">
                    {phone.status === "live" ? "🔴 Connected" :
                     phone.status === "connecting" ? "Connecting…" :
                     phone.status === "waiting" ? "Waiting for phone…" :
                     phone.status === "error" ? "Error" : "Idle"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { phone.cancelSession(); setQrDataUrl(null); }}
                    className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-bold hover:bg-muted/70"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setPhoneOpen(false)}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => phone.startSession()}
                className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                Generate pairing link
              </button>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-border" />;
}

function BottomBtn({
  icon: Icon, activeIcon: ActiveIcon, active, onClick, label, disabled,
}: {
  icon: typeof Mic;
  activeIcon?: typeof MicOff;
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  const I = active && ActiveIcon ? ActiveIcon : Icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold transition disabled:opacity-40 ${active ? "bg-destructive text-destructive-foreground" : "bg-muted hover:bg-muted/70"}`}
    >
      <I className="h-4 w-4" />
      {label}
    </button>
  );
}
