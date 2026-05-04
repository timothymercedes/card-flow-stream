import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ScanResult = { name: string; category: string; trend: string; image: string };

export function CardScanner({ onResult, onClose }: { onResult: (r: ScanResult) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: "environment" | "user") {
    setError(null);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
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
    start(facing);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  async function capture() {
    if (!videoRef.current || scanning) return;
    setScanning(true);
    try {
      const v = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 640;
      canvas.height = v.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas error");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      const { data, error } = await supabase.functions.invoke("scan-card", { body: { image: dataUrl } });
      if (error) throw error;
      onResult({ ...(data as any), image: dataUrl });
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white"><X className="h-5 w-5" /></button>
        <p className="text-sm font-semibold text-white">Scan Card</p>
        <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="rounded-full bg-white/10 p-2 text-white"><RefreshCw className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">{error}</div>
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        )}
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/60" />
      </div>
      <div className="p-6">
        <button onClick={capture} disabled={scanning || !!error} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black disabled:opacity-50">
          {scanning ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
        </button>
        <p className="mt-2 text-center text-xs text-white/60">Tap to capture & identify</p>
      </div>
    </div>
  );
}
