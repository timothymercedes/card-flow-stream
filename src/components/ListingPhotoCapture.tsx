import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Camera, RefreshCw, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
};

/**
 * Camera-only photo capture for listings. No file upload, no URL paste —
 * sellers must take the picture live with their device camera so the photo
 * is verifiably theirs. Uploads the captured frame to the `listing-images`
 * bucket and returns the public URL.
 */
export function ListingPhotoCapture({ value, onChange, label = "Photo", className }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        toast.error("Camera access denied — enable camera permissions");
        setOpen(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  useEffect(() => {
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setOpen(false);
  }

  async function snap() {
    if (!user) return toast.error("Sign in first");
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Capture failed"))), "image/jpeg", 0.9)
      );
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from("listing-images").upload(path, blob, {
        cacheControl: "3600",
        contentType: "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Photo captured");
      close();
    } catch (e: any) {
      toast.error(e.message || "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
      {value ? (
        <div className="relative">
          <img src={value} alt="captured" className="h-32 w-full rounded-lg object-cover ring-1 ring-border" />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-muted px-3 py-2 text-xs font-bold"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retake
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-lg bg-muted px-2 py-2 text-xs"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/30 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Camera className="h-6 w-6" />
          Tap to take photo
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          <div className="flex items-center justify-between p-3">
            <p className="text-sm font-bold text-white">{label}</p>
            <button onClick={close} className="rounded-full bg-white/10 p-2 text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
          </div>
          <div className="flex items-center justify-around p-4">
            <button
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="rounded-full bg-white/10 p-3 text-white"
              title="Flip camera"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              onClick={snap}
              disabled={busy}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl ring-4 ring-white/30 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-7 w-7" />}
            </button>
            <div className="w-11" />
          </div>
        </div>
      )}
    </div>
  );
}
