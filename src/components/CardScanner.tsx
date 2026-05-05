import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type ScanResult = {
  name: string;
  category: string;
  set?: string;
  year?: string;
  tcg_number?: string;
  variant?: string;
  language?: string;
  estimated_value?: number;
  condition_prices?: { NM?: number; LP?: number; MP?: number; Damaged?: number };
  trend: string;
  image: string;
  confidence?: { name?: number; set?: number; year?: number; tcg_number?: number; variant?: number };
};

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

export function CardScanner({ onResult, onClose, defaultLanguage = "auto" }: { onResult: (r: ScanResult) => void; onClose: () => void; defaultLanguage?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(defaultLanguage);

  // 🆕 Confirm-before-save step
  const [pending, setPending] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState(false);

  // 🆕 Auto-capture
  const [autoCapture, setAutoCapture] = useState(true);
  const [hint, setHint] = useState<string>("Point camera at a card");
  const [steadyPct, setSteadyPct] = useState(0);
  const autoTimerRef = useRef<number | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const steadyTicksRef = useRef(0);
  const capturingRef = useRef(false);

  async function start(mode: "environment" | "user") {
    setError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        // Higher resolution → better small-text recognition (set symbol, card number, ©year)
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
    if (pending) return; // pause camera once we have a candidate
    start(facing);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, pending]);

  async function capture() {
    if (!videoRef.current || scanning) return;
    setScanning(true);
    try {
      const v = videoRef.current;
      // Higher res capture (1024 long side) so the model can read set symbol + card number reliably.
      const srcW = v.videoWidth || 1280;
      const srcH = v.videoHeight || 720;
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(srcW, srcH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(srcW * scale);
      canvas.height = Math.round(srcH * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas error");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      const { data, error } = await supabase.functions.invoke("scan-card", {
        body: { image: dataUrl, language: language === "auto" ? undefined : language },
      });
      if (error) throw error;
      const result: ScanResult = { ...(data as any), image: dataUrl, language };
      setPending(result);
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function confirmResult() {
    if (!pending) return;
    onResult(pending);
  }

  function patch<K extends keyof ScanResult>(k: K, v: ScanResult[K]) {
    setPending((p) => (p ? { ...p, [k]: v } : p));
  }

  function rescan() {
    setPending(null);
    setEditing(false);
  }

  function lowConf(v?: number) { return (v ?? 1) < 0.7; }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>
        <p className="text-sm font-semibold text-white">{pending ? "Confirm card" : "Scan Card"}</p>
        {!pending ? (
          <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="rounded-full bg-white/10 p-2 text-white"><RefreshCw className="h-5 w-5" /></button>
        ) : (
          <button onClick={rescan} className="rounded-full bg-white/10 p-2 text-white" title="Rescan"><RefreshCw className="h-5 w-5" /></button>
        )}
      </div>

      {!pending && (
        <>
          {/* Language picker — helps pull the right printing (EN/JP/KR/CN…) */}
          <div className="px-3 pb-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">Card language</p>
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

          <div className="relative flex-1 overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">{error}</div>
            ) : (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            )}
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/60" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/70">
              Frame the whole card · keep set symbol + card number visible
            </p>
          </div>
          <div className="p-6">
            <button onClick={capture} disabled={scanning || !!error} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black disabled:opacity-50">
              {scanning ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
            </button>
            <p className="mt-2 text-center text-xs text-white/60">Tap to capture & identify</p>
          </div>
        </>
      )}

      {pending && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
          <div className="flex gap-3">
            <img src={pending.image} alt="" className="h-40 w-28 shrink-0 rounded-lg object-cover ring-1 ring-white/20" />
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
              <Field
                label="Variant"
                value={pending.variant || "Standard"}
                editing={editing}
                onChange={(v) => patch("variant", v)}
                warn={lowConf(pending.confidence?.variant)}
              />
              <p className="text-[11px] text-white/70">
                Est. value: <b className="text-emerald-300">${Number(pending.estimated_value || 0).toFixed(2)}</b> · {pending.trend}
              </p>
            </div>
          </div>

          {(lowConf(pending.confidence?.set) ||
            lowConf(pending.confidence?.year) ||
            lowConf(pending.confidence?.tcg_number)) && (
            <div className="rounded-lg bg-yellow-500/15 px-3 py-2 text-[11px] text-yellow-200">
              ⚠ Low confidence on highlighted fields — please verify or edit before saving.
            </div>
          )}

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
          <button onClick={rescan} className="text-center text-xs text-white/60 underline">
            Wrong card? Rescan
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, editing, onChange, warn,
}: { label: string; value: string; editing: boolean; onChange: (v: string) => void; warn?: boolean }) {
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
        <p className="text-sm font-semibold text-white">{value || <span className="text-white/40">—</span>}</p>
      )}
    </div>
  );
}
