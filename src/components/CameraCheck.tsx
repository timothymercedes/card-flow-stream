import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Optional pre-live camera + mic check. Stops all tracks when closed or unmounted. */
export function CameraCheck() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => {
    if (!stream) return;
    if (video.current) video.current.srcObject = stream;
    if (!stream.getAudioTracks().length) return;
    const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount); let raf = 0;
    const tick = () => { an.getByteFrequencyData(buf); setLevel(Math.min(100, (buf.reduce((a, b) => a + b, 0) / buf.length) * 1.6)); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
  }, [stream]);
  async function start() {
    setErr("");
    try { setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })); }
    catch (e: any) { setErr(e?.name === "NotAllowedError" ? "Camera blocked — allow it from the camera icon in your browser's address bar." : "Couldn't start your camera. Close other apps using it and try again."); }
  }
  function stop() { stream?.getTracks().forEach((t) => t.stop()); setStream(null); setLevel(0); }
  return (
    <div className="space-y-2 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-sm font-bold">Camera & mic check</p><p className="text-[11px] text-muted-foreground">See how you look and sound before going live.</p></div>
        {stream ? <Button size="sm" variant="outline" onClick={stop}><CameraOff />Stop</Button> : <Button size="sm" onClick={() => void start()}><Camera />Test camera</Button>}
      </div>
      {stream && (
        <>
          <video ref={video} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 rounded-xl bg-muted object-cover" />
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Mic className="h-3.5 w-3.5" /><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${level}%` }} /></div>{level > 8 ? "Mic working" : "Say something…"}</div>
        </>
      )}
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
