import { useEffect, useRef, useState } from "react";
import { Camera, X, ScanLine, CheckCircle2, AlertTriangle, Keyboard } from "lucide-react";
import { registerShippingScan, type ScanResult } from "@/lib/shipping";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/motion";
import { toast } from "sonner";

/**
 * PackageScanner — mobile-first barcode scanner for shipping prep.
 * Uses the native `BarcodeDetector` API (Chromium-based mobile browsers).
 * Falls back to manual entry on iOS Safari and unsupported browsers so
 * sellers are never blocked.
 *
 * On match: advances order to ready_for_dropoff, plays sfx + haptic,
 * notifies buyer (server trigger), logs to shipping_scans.
 * On mismatch: warns and logs the failed scan to audit.
 *
 * `onScanned` lets the parent refresh its order queue. `bulk` keeps the
 * camera alive after each successful scan for high-volume sellers.
 */
export function PackageScanner({
  open,
  onClose,
  onScanned,
  bulk = false,
}: {
  open: boolean;
  onClose: () => void;
  onScanned?: (r: ScanResult) => void;
  bulk?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef<number>(0);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<ScanResult[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const BD = (window as any).BarcodeDetector;
        if (!BD) { setSupported(false); return; }
        detectorRef.current = new BD({ formats: ["qr_code", "code_128", "code_39", "ean_13", "upc_a", "data_matrix"] });

        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        loop();
      } catch {
        setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loop() {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      const code = codes?.[0]?.rawValue?.toString().trim();
      const now = Date.now();
      if (code && code.length >= 6 && (code !== lastCodeRef.current || now - lastAtRef.current > 3000)) {
        lastCodeRef.current = code;
        lastAtRef.current = now;
        await handleCode(code);
      }
    } catch {/* frame error – continue */}
    // throttle to ~6fps to save battery
    rafRef.current = window.setTimeout(() => loop(), 160) as unknown as number;
  }

  async function handleCode(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await registerShippingScan(code, "tracking");
      setRecent((r) => [res, ...r].slice(0, 6));
      onScanned?.(res);
      if (res.result === "matched") {
        playSfx("sold"); haptic([20, 40, 20]);
        toast.success(`✅ Matched · ${res.new_status?.replace(/_/g, " ")}`);
      } else if (res.result === "mismatch") {
        haptic([60, 40, 60]);
        toast.error("Mismatch — this label belongs to another seller");
      } else {
        haptic(80);
        toast.warning("Unmatched — no order found for this code");
      }
      if (!bulk && res.result === "matched") {
        setTimeout(() => onClose(), 700);
      }
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-label="Package scanner">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest">
          <ScanLine className="h-4 w-4" /> Scan package {bulk && <span className="rounded-full bg-emerald-500/20 px-2 text-[9px] text-emerald-300">Bulk</span>}
        </p>
        <button onClick={onClose} aria-label="Close scanner" className="rounded-full bg-white/10 p-2"><X className="h-4 w-4" /></button>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        {supported ? (
          <>
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-1/3 w-3/4 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <Camera className="h-8 w-8 opacity-60" />
            <p className="font-bold">Camera scanning not supported on this browser.</p>
            <p className="text-xs opacity-70">Type or paste the tracking number below.</p>
          </div>
        )}
      </div>

      <footer className="space-y-2 border-t border-white/10 bg-black/90 p-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 opacity-60" />
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Type tracking number…"
            className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-sm placeholder:text-white/40"
            onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { handleCode(manual.trim()); setManual(""); } }}
          />
          <button
            onClick={() => { if (manual.trim()) { handleCode(manual.trim()); setManual(""); } }}
            disabled={busy || !manual.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground disabled:opacity-40"
          >
            Submit
          </button>
        </div>
        {recent.length > 0 && (
          <ul className="max-h-28 overflow-auto space-y-1 text-[11px]">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {r.result === "matched"
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                <span className="truncate">
                  {r.result === "matched" ? `Order ${r.order_id?.slice(0,8)} → ${r.new_status?.replace(/_/g," ")}` : r.result}
                </span>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
