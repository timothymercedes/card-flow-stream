import { useEffect, useRef, useState } from "react";
import {
  Camera,
  RefreshCw,
  X,
  Loader2,
  Check,
  Pencil,
  Layers,
  Square,
  CheckSquare,
  Sparkles,
  Search,
  Package,
  Tag,
  Gavel,
  Save,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ManualCardFinder, type FinderCard } from "@/components/ManualCardFinder";

export type ScanAlternative = {
  name: string;
  set?: string;
  year?: string;
  tcg_number?: string;
  variant?: string;
  rarity?: string;
  estimated_value?: number;
  image_url?: string;
};

export type ScanResult = {
  name: string;
  category: string;
  set?: string;
  year?: string;
  tcg_number?: string;
  variant?: string;
  rarity?: string;
  language?: string;
  estimated_value?: number;
  condition_prices?: { NM?: number; LP?: number; MP?: number; Damaged?: number };
  trend: string;
  image: string;
  confidence?: {
    name?: number;
    set?: number;
    year?: number;
    tcg_number?: number;
    variant?: number;
  };
  overall_confidence?: number;
  match_label?: string;
  alternatives?: ScanAlternative[];
};

export type ScanAction = "inventory" | "list" | "auction" | "draft";

const LANGUAGES = [
  { v: "auto", l: "Auto" },
  { v: "en", l: "English" },
  { v: "jp", l: "Japanese" },
  { v: "kr", l: "Korean" },
  { v: "zh", l: "Chinese" },
  { v: "de", l: "German" },
  { v: "fr", l: "French" },
  { v: "es", l: "Spanish" },
  { v: "it", l: "Italian" },
  { v: "pt", l: "Portuguese" },
  { v: "ru", l: "Russian" },
] as const;

type Props = {
  onResult: (r: ScanResult) => void;
  onResults?: (rs: ScanResult[]) => void; // optional batch handler (multi-card)
  onClose: () => void;
  defaultLanguage?: string;
  allowMulti?: boolean; // shows the multi-card toggle (default true)
  /** Optional quick-action menu shown on the confirm screen. */
  onAction?: (action: ScanAction, result: ScanResult) => void;
  /** Optional callback when user taps "Find correct card" (manual finder). */
  onFindCorrect?: (current: ScanResult) => void;
};

export function CardScanner({
  onResult,
  onResults,
  onClose,
  defaultLanguage = "auto",
  allowMulti = true,
  onAction,
  onFindCorrect,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(defaultLanguage);

  // Multi-card mode
  const [multi, setMulti] = useState(false);
  const [batch, setBatch] = useState<ScanResult[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Confirm-before-save (single)
  const [pending, setPending] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);

  // Auto-capture
  const [autoCapture, setAutoCapture] = useState(true);
  const [hint, setHint] = useState<string>("Point camera at a card");
  const [steadyPct, setSteadyPct] = useState(0);
  const autoTimerRef = useRef<number | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const steadyTicksRef = useRef(0);
  const capturingRef = useRef(false);

  function stopScannerCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }

  async function start(mode: "environment" | "user") {
    setError(null);
    try {
      stopScannerCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e: any) {
      setError(e?.message || "Camera unavailable. Check permissions.");
    }
  }

  useEffect(() => {
    if (pending || batch) return;
    start(facing);
    return () => {
      stopScannerCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, pending, batch]);

  async function capture() {
    if (!videoRef.current || capturingRef.current) return;
    capturingRef.current = true;
    setScanning(true);
    try {
      const v = videoRef.current;
      const srcW = v.videoWidth || 1280;
      const srcH = v.videoHeight || 720;
      // Multi-card mode keeps higher resolution so small text/symbols on each card stay legible.
      const MAX = multi ? 1600 : 1024;
      const scale = Math.min(1, MAX / Math.max(srcW, srcH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(srcW * scale);
      canvas.height = Math.round(srcH * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas error");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

      const { data, error } = await supabase.functions.invoke("scan-card", {
        body: { image: dataUrl, language: language === "auto" ? undefined : language, multi },
      });
      if (error) {
        // FunctionsHttpError surfaces the JSON body in error.context
        let msg = error.message || "Scan failed";
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) msg = parsed.error;
          }
        } catch {}
        toast.error(msg);
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        return;
      }

      if (multi) {
        const cards: ScanResult[] =
          (data as any)?.cards?.map((c: any) => ({
            ...c,
            image: dataUrl,
            language: c.language || language,
          })) || [];
        if (cards.length === 0) {
          toast.error("No cards detected — try better lighting or fewer cards");
        } else {
          setBatch(cards);
          setSelected(new Set(cards.map((_, i) => i))); // pre-select all
          // stop camera while reviewing
          stopScannerCamera();
        }
      } else {
        const result: ScanResult = { ...(data as any), image: dataUrl, language };
        setPending(result);
      }
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
      capturingRef.current = false;
    }
  }

  // Auto-capture: detect a stable, well-framed card and snap automatically — tuned faster.
  useEffect(() => {
    if (pending || batch || !autoCapture) {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
      return;
    }
    const small = document.createElement("canvas");
    small.width = 80;
    small.height = 60;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    if (!sctx) return;

    autoTimerRef.current = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || capturingRef.current || scanning) return;
      sctx.drawImage(v, 0, 0, small.width, small.height);
      const frame = sctx.getImageData(0, 0, small.width, small.height);

      let lumaSum = 0;
      let edgeCount = 0;
      const d = frame.data;
      const w = small.width;
      for (let y = 1; y < small.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          lumaSum += l;
          const ir = (y * w + (x + 1)) * 4;
          const lr = 0.299 * d[ir] + 0.587 * d[ir + 1] + 0.114 * d[ir + 2];
          if (Math.abs(l - lr) > 28) edgeCount++;
        }
      }
      const avgLuma = lumaSum / (w * small.height);
      const edgeRatio = edgeCount / (w * small.height);

      let diff = 0;
      const prev = prevFrameRef.current;
      if (prev && prev.data.length === d.length) {
        for (let i = 0; i < d.length; i += 16) diff += Math.abs(d[i] - prev.data[i]);
        diff = diff / (d.length / 16);
      }
      prevFrameRef.current = frame;

      const wellLit = avgLuma > 35 && avgLuma < 235;
      const hasCard = edgeRatio > (multi ? 0.06 : 0.045);
      const steady = diff < 8; // a touch more forgiving — feels near-instant

      if (wellLit && hasCard && steady) steadyTicksRef.current += 1;
      else steadyTicksRef.current = Math.max(0, steadyTicksRef.current - 1);

      const need = 3; // ~300ms steady → near-instant capture
      const pct = Math.min(100, (steadyTicksRef.current / need) * 100);
      setSteadyPct(pct);

      if (!hasCard) setHint(multi ? "Show your cards" : "Point camera at a card");
      else if (!wellLit) setHint("More light needed");
      else if (!steady) setHint("Hold steady…");
      else setHint("Locking…");

      if (steadyTicksRef.current >= need) {
        steadyTicksRef.current = 0;
        setSteadyPct(0);
        setHint("Capturing…");
        capture();
      }
    }, 100);

    return () => {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, batch, autoCapture, scanning, multi]);

  function confirmResult() {
    if (!pending) return;
    onResult(pending);
  }

  function patch<K extends keyof ScanResult>(k: K, v: ScanResult[K]) {
    setPending((p) => (p ? { ...p, [k]: v } : p));
  }

  function rescan() {
    setPending(null);
    setBatch(null);
    setSelected(new Set());
    setEditing(false);
  }

  function lowConf(v?: number) {
    return (v ?? 1) < 0.7;
  }

  function toggleSel(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }
  function toggleSelectAll() {
    if (!batch) return;
    setSelected((s) => (s.size === batch.length ? new Set() : new Set(batch.map((_, i) => i))));
  }
  function addSelected() {
    if (!batch) return;
    const picks = batch.filter((_, i) => selected.has(i));
    if (picks.length === 0) return toast.error("Select at least one card");
    if (onResults) onResults(picks);
    else picks.forEach((p) => onResult(p)); // fallback for callers w/o batch handler
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">
          {pending
            ? "Confirm card"
            : batch
              ? `Detected ${batch.length} cards`
              : multi
                ? "Scan multiple cards"
                : "Scan Card"}
        </p>
        {!pending && !batch ? (
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="rounded-full bg-white/10 p-2 text-white"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={rescan}
            className="rounded-full bg-white/10 p-2 text-white"
            title="Rescan"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      </div>

      {!pending && !batch && (
        <>
          <div className="px-3 pb-2 space-y-2">
            {allowMulti && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setMulti(false)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${!multi ? "bg-white text-black" : "bg-white/10 text-white"}`}
                >
                  Single card
                </button>
                <button
                  onClick={() => setMulti(true)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 ${multi ? "bg-emerald-500 text-white" : "bg-white/10 text-white"}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Multi-card
                </button>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                Card language
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.v}
                    onClick={() => setLanguage(lang.v)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${language === lang.v ? "bg-white text-black" : "bg-white/10 text-white"}`}
                  >
                    {lang.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">
                {error}
              </div>
            ) : (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            )}
            <div
              className="pointer-events-none absolute inset-8 rounded-2xl border-2 transition-colors"
              style={{ borderColor: steadyPct > 60 ? "rgb(16,185,129)" : "rgba(255,255,255,0.6)" }}
            />
            {autoCapture && !scanning && (
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
                {hint} {steadyPct > 0 && steadyPct < 100 ? `· ${Math.round(steadyPct)}%` : ""}
              </div>
            )}
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/70">
              {multi
                ? "Lay cards flat, no overlap · keep all set symbols visible"
                : "Frame the whole card · keep set symbol + card number visible"}
            </p>
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center justify-center gap-2">
              <button
                onClick={() => setAutoCapture((a) => !a)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${autoCapture ? "bg-emerald-500 text-white" : "bg-white/10 text-white"}`}
              >
                {autoCapture ? "Auto-capture: ON" : "Auto-capture: OFF"}
              </button>
            </div>
            <button
              onClick={capture}
              disabled={scanning || !!error}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <Camera className="h-7 w-7" />
              )}
            </button>
            <p className="mt-2 text-center text-xs text-white/60">
              {scanning
                ? multi
                  ? "Reading every card…"
                  : "Identifying…"
                : autoCapture
                  ? "Hold steady — auto-snaps when ready"
                  : "Tap to capture"}
            </p>
          </div>
        </>
      )}

      {/* Multi-card review */}
      {batch && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white"
            >
              {selected.size === batch.length ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {selected.size === batch.length ? "Deselect all" : "Select all"}
            </button>
            <p className="text-[11px] text-white/60">
              {selected.size} / {batch.length} selected
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto px-4 pb-2 sm:grid-cols-3">
            {batch.map((c, i) => {
              const on = selected.has(i);
              const warn =
                lowConf(c.confidence?.name) ||
                lowConf(c.confidence?.set) ||
                lowConf(c.confidence?.tcg_number);
              return (
                <button
                  key={i}
                  onClick={() => toggleSel(i)}
                  className={`relative overflow-hidden rounded-xl border-2 text-left transition ${on ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                >
                  <div className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/60 p-1 text-white">
                    {on ? (
                      <CheckSquare className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </div>
                  <div className="aspect-[3/4] w-full bg-black">
                    <img src={c.image} alt="" className="h-full w-full object-cover opacity-90" />
                  </div>
                  <div className="space-y-0.5 p-2 text-white">
                    <p className="truncate text-[12px] font-bold">{c.name}</p>
                    <p className="truncate text-[10px] text-white/60">
                      {c.set || "—"} {c.tcg_number ? `· #${c.tcg_number}` : ""}
                    </p>
                    <p className="text-[10px] text-emerald-300">
                      ${Number(c.estimated_value || 0).toFixed(2)}
                    </p>
                    {warn && (
                      <p className="text-[9px] text-yellow-300">⚠ Low confidence — verify</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              onClick={rescan}
              className="rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
            >
              Rescan
            </button>
            <button
              onClick={addSelected}
              disabled={selected.size === 0}
              className="rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              Add {selected.size > 0 ? `${selected.size} ` : ""}selected
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
          {/* Confidence badge */}
          {(() => {
            const oc = pending.overall_confidence ?? 0.6;
            const pct = Math.round(oc * 100);
            const tone =
              oc >= 0.9
                ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40"
                : oc >= 0.7
                  ? "bg-yellow-500/15 text-yellow-200 ring-yellow-400/40"
                  : "bg-red-500/15 text-red-300 ring-red-400/40";
            const label = pending.match_label || (oc >= 0.9 ? `${pct}% Match` : oc >= 0.7 ? `Likely Match (${pct}%)` : "Possible Match");
            return (
              <div className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${tone}`}>
                <div className="flex items-center gap-2 text-[12px] font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> {label}
                </div>
                <div className="text-[10px] uppercase tracking-wide opacity-80">AI confidence</div>
              </div>
            );
          })()}

          <div className="flex gap-3">
            <img
              src={pending.image}
              alt=""
              className="h-40 w-28 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
            />
            <div className="min-w-0 flex-1 space-y-1.5 text-white">
              <Field
                label="Name"
                value={pending.name}
                editing={editing}
                onChange={(v) => patch("name", v)}
                warn={lowConf(pending.confidence?.name)}
              />
              <Field
                label="Set"
                value={pending.set || ""}
                editing={editing}
                onChange={(v) => patch("set", v)}
                warn={lowConf(pending.confidence?.set)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Field
                  label="Year"
                  value={pending.year || ""}
                  editing={editing}
                  onChange={(v) => patch("year", v)}
                  warn={lowConf(pending.confidence?.year)}
                />
                <Field
                  label="Number"
                  value={pending.tcg_number || ""}
                  editing={editing}
                  onChange={(v) => patch("tcg_number", v)}
                  warn={lowConf(pending.confidence?.tcg_number)}
                />
                <Field
                  label="Lang"
                  value={pending.language || "EN"}
                  editing={editing}
                  onChange={(v) => patch("language", v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Variant"
                  value={pending.variant || "Standard"}
                  editing={editing}
                  onChange={(v) => patch("variant", v)}
                  warn={lowConf(pending.confidence?.variant)}
                />
                <Field
                  label="Rarity"
                  value={pending.rarity || ""}
                  editing={editing}
                  onChange={(v) => patch("rarity", v)}
                />
              </div>
              <p className="text-[11px] text-white/70">
                Est. value:{" "}
                <b className="text-emerald-300">
                  ${Number(pending.estimated_value || 0).toFixed(2)}
                </b>{" "}
                · {pending.trend}
              </p>
            </div>
          </div>

          {/* Did you mean one of these? — shown when overall confidence is < 0.9 and alternatives exist */}
          {(pending.alternatives?.length ?? 0) > 0 && (pending.overall_confidence ?? 1) < 0.9 && (
            <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/70">
                Did you mean one of these?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {pending.alternatives!.slice(0, 3).map((a, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setPending((p) =>
                        p
                          ? {
                              ...p,
                              name: a.name || p.name,
                              set: a.set || p.set,
                              year: a.year || p.year,
                              tcg_number: a.tcg_number || p.tcg_number,
                              variant: a.variant || p.variant,
                              rarity: a.rarity || p.rarity,
                              estimated_value: a.estimated_value || p.estimated_value,
                              overall_confidence: 0.95,
                              match_label: "Match confirmed",
                              alternatives: [],
                            }
                          : p,
                      )
                    }
                    className="overflow-hidden rounded-lg bg-black/40 text-left ring-1 ring-white/10 transition hover:ring-emerald-400/60"
                  >
                    <div className="aspect-[3/4] w-full bg-black">
                      {a.image_url ? (
                        <img src={a.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 p-1.5 text-white">
                      <p className="truncate text-[11px] font-bold">{a.name}</p>
                      <p className="truncate text-[9px] text-white/60">
                        {a.set || "—"}
                        {a.tcg_number ? ` · #${a.tcg_number}` : ""}
                      </p>
                      {a.estimated_value ? (
                        <p className="text-[10px] text-emerald-300">
                          ${Number(a.estimated_value).toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(lowConf(pending.confidence?.set) ||
            lowConf(pending.confidence?.year) ||
            lowConf(pending.confidence?.tcg_number)) && (
            <div className="rounded-lg bg-yellow-500/15 px-3 py-2 text-[11px] text-yellow-200">
              ⚠ Low confidence on highlighted fields — please verify or edit before saving.
            </div>
          )}

          {/* Quick actions */}
          {onAction ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onAction("inventory", pending)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white"
              >
                <Package className="h-4 w-4" /> Add to Inventory
              </button>
              <button
                onClick={() => onAction("list", pending)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-extrabold text-black"
              >
                <Tag className="h-4 w-4" /> List for Sale
              </button>
              <button
                onClick={() => onAction("auction", pending)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Gavel className="h-4 w-4" /> Start Auction
              </button>
              <button
                onClick={() => onAction("draft", pending)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Save className="h-4 w-4" /> Save Draft
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditing((e) => !e)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Pencil className="h-4 w-4" /> {editing ? "Done editing" : "Edit fields"}
              </button>
              <button
                onClick={confirmResult}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white"
              >
                <Check className="h-4 w-4" /> Confirm & save
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 text-[11px]">
            <button
              onClick={() => setEditing((e) => !e)}
              className="flex items-center gap-1 text-white/70 underline"
            >
              <Pencil className="h-3 w-3" /> {editing ? "Done editing" : "Edit fields"}
            </button>
            {onFindCorrect && (
              <button
                onClick={() => pending && onFindCorrect(pending)}
                className="flex items-center gap-1 text-emerald-300 underline"
              >
                <Search className="h-3 w-3" /> Find correct card
              </button>
            )}
            <button onClick={rescan} className="text-white/60 underline">
              Rescan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  warn,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-md ${warn ? "ring-1 ring-yellow-400/60" : ""}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">{label}</p>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded bg-white/10 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-400"
        />
      ) : (
        <p className="text-sm font-semibold text-white">
          {value || <span className="text-white/40">—</span>}
        </p>
      )}
    </div>
  );
}
