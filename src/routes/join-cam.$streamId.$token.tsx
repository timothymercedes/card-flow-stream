import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, RefreshCcw, Video, VideoOff } from "lucide-react";

export const Route = createFileRoute("/join-cam/$streamId/$token")({
  head: () => ({ meta: [{ title: "Join as camera — PullBidLive" }] }),
  component: JoinCam,
});

function JoinCam() {
  const { streamId, token } = Route.useParams();
  const [status, setStatus] = useState<
    "idle" | "asking" | "connecting" | "live" | "error" | "ended"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
  }
  useEffect(() => () => cleanup(), []);

  async function start() {
    setError(null);
    setStatus("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false, // host already has mic; avoid double audio
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setStatus("connecting");

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const channel = supabase.channel(`phone-cam:${streamId}:${token}`, {
        config: { broadcast: { self: false, ack: false } },
      });
      channelRef.current = channel;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          channel.send({
            type: "broadcast",
            event: "ice-phone",
            payload: { candidate: ev.candidate.toJSON() },
          });
        }
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") setStatus("live");
        if (st === "failed" || st === "disconnected" || st === "closed") setStatus("ended");
      };

      channel.on("broadcast", { event: "answer" }, async ({ payload }) => {
        try { await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp }); } catch {}
      });
      channel.on("broadcast", { event: "ice-host" }, async ({ payload }) => {
        try { await pc.addIceCandidate(payload.candidate); } catch {}
      });

      await new Promise<void>((resolve) => {
        channel.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await channel.send({
        type: "broadcast",
        event: "offer",
        payload: { sdp: offer.sdp },
      });
    } catch (e: any) {
      setError(e?.message || "Could not access camera");
      setStatus("error");
      cleanup();
    }
  }

  function flipCamera() {
    setFacing((f) => (f === "user" ? "environment" : "user"));
    if (status === "live" || status === "connecting") {
      cleanup();
      setTimeout(() => start(), 100);
    }
  }

  function endSession() {
    cleanup();
    setStatus("ended");
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-bold">Phone camera</p>
          <p className="text-[10px] text-white/60">Code: {token}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            status === "live" ? "bg-red-500" :
            status === "connecting" || status === "asking" ? "bg-amber-500" :
            status === "error" ? "bg-destructive" :
            status === "ended" ? "bg-white/20" :
            "bg-white/10"
          }`}
        >
          {status === "live" ? "● LIVE" :
           status === "connecting" ? "Connecting…" :
           status === "asking" ? "Camera permission…" :
           status === "error" ? "Error" :
           status === "ended" ? "Ended" :
           "Ready"}
        </span>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          muted
          playsInline
          autoPlay
        />
        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            <Camera className="h-10 w-10 text-primary" />
            <h1 className="text-lg font-bold">Send your phone camera to the live stream</h1>
            <p className="text-xs text-white/70">
              Tap start, allow camera access, and your phone will appear inside the host&apos;s studio as an extra camera source.
            </p>
            <button
              onClick={start}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              <Video className="h-4 w-4" /> Start camera
            </button>
          </div>
        )}

        {(status === "asking" || status === "connecting") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <p className="text-sm font-bold text-destructive">Couldn&apos;t start camera</p>
            <p className="max-w-xs text-xs text-white/70">{error}</p>
            <button onClick={start} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Try again</button>
          </div>
        )}

        {status === "ended" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <p className="text-sm font-bold">Disconnected</p>
            <button onClick={start} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Reconnect</button>
          </div>
        )}
      </div>

      {(status === "live" || status === "connecting") && (
        <footer className="flex items-center justify-center gap-3 border-t border-white/10 p-3">
          <button onClick={flipCamera} className="flex flex-col items-center gap-0.5 rounded-xl bg-white/10 px-4 py-2 text-[10px] font-bold">
            <RefreshCcw className="h-4 w-4" /> Flip
          </button>
          <button onClick={endSession} className="flex flex-col items-center gap-0.5 rounded-xl bg-destructive px-4 py-2 text-[10px] font-bold text-destructive-foreground">
            <VideoOff className="h-4 w-4" /> End
          </button>
        </footer>
      )}
    </div>
  );
}
