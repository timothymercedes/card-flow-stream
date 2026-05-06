import { useEffect, useRef, useState } from "react";
import type { RemoteCohost } from "@/hooks/useCloudflareCalls";

/**
 * Browser-side canvas compositor + WHIP publisher.
 *
 * Composites the host's local camera + every remote co-host video tile into a
 * single 1280x720 canvas, captures it via canvas.captureStream(), mixes audio
 * tracks via Web Audio, and publishes the merged feed to Cloudflare Stream
 * via WHIP (WebRTC-HTTP Ingestion Protocol).
 *
 * The result: viewers watching the HLS playback see ONE stream containing
 * all co-host tiles baked in — same as a Whatnot/TikTok multi-guest feed.
 *
 * Layout:
 *   1 host           → fullscreen
 *   1 host + 1 guest → side-by-side
 *   3 hosts          → main + 2 strip
 *   4 hosts          → 2x2 grid
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 30;

export function useCanvasCompositor(opts: {
  enabled: boolean;
  whipUrl: string | null;
  localStream: MediaStream | null;
  remotes: RemoteCohost[];
  localUsername: string;
}) {
  const { enabled, whipUrl, localStream, remotes, localUsername } = opts;
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const whipResourceRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  // ─── Render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !localStream) return;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Build hidden <video> elements for every source so we can drawImage them
    const videos = new Map<string, { v: HTMLVideoElement; label: string }>();
    function ensureVideo(id: string, stream: MediaStream, label: string) {
      let entry = videos.get(id);
      if (!entry) {
        const v = document.createElement("video");
        v.autoplay = true; v.muted = true; v.playsInline = true;
        v.srcObject = stream; v.play().catch(() => {});
        entry = { v, label };
        videos.set(id, entry);
      } else {
        entry.label = label;
      }
      return entry;
    }

    function tick() {
      if (!ctx) return;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const sources: { id: string; stream: MediaStream; label: string }[] = [];
      if (localStream) sources.push({ id: "local", stream: localStream, label: `@${localUsername}` });
      for (const r of remotes) sources.push({ id: r.userId, stream: r.stream, label: `@${r.username}` });

      const tiles = layoutTiles(sources.length);
      sources.slice(0, tiles.length).forEach((s, i) => {
        const { v } = ensureVideo(s.id, s.stream, s.label);
        const t = tiles[i];
        if (v.videoWidth > 0) {
          drawCover(ctx, v, t.x, t.y, t.w, t.h);
        } else {
          ctx.fillStyle = "#1a1a1a"; ctx.fillRect(t.x, t.y, t.w, t.h);
        }
        // Label
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(t.x + 12, t.y + t.h - 36, ctx.measureText(s.label).width + 16, 24);
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui";
        ctx.fillText(s.label, t.x + 20, t.y + t.h - 18);
      });

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      videos.forEach(({ v }) => { v.pause(); v.srcObject = null; });
      videos.clear();
    };
  }, [enabled, localStream, remotes, localUsername]);

  // ─── WHIP publish (one-shot once enabled + canvas + whipUrl ready) ─────
  useEffect(() => {
    if (!enabled || !whipUrl || !localStream || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        // Mixed audio: host mic + every remote audio track
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioDestRef.current = dest;

        function connectAudio(id: string, stream: MediaStream) {
          if (audioNodesRef.current.has(id)) return;
          const at = stream.getAudioTracks();
          if (at.length === 0) return;
          const src = audioCtx.createMediaStreamSource(new MediaStream(at));
          src.connect(dest);
          audioNodesRef.current.set(id, src);
        }
        connectAudio("local", localStream);
        for (const r of remotes) connectAudio(r.userId, r.stream);

        // Composite stream = canvas video + mixed audio
        const videoStream = canvasRef.current!.captureStream(FPS);
        const composite = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
          bundlePolicy: "max-bundle",
        });
        pcRef.current = pc;
        composite.getTracks().forEach((t) => pc.addTransceiver(t, { direction: "sendonly" }));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // WHIP: POST SDP offer, get answer back
        const r = await fetch(whipUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });
        if (!r.ok) throw new Error(`WHIP ${r.status}: ${await r.text()}`);
        whipResourceRef.current = r.headers.get("location");
        const answerSdp = await r.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        if (!cancelled) setPublishing(true);
      } catch (e: any) {
        console.error("[whip] publish failed", e);
        if (!cancelled) setError(e.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      // Best-effort WHIP DELETE
      const res = whipResourceRef.current;
      if (res) {
        try { fetch(res, { method: "DELETE" }).catch(() => {}); } catch {}
      }
      whipResourceRef.current = null;
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
      audioDestRef.current = null;
      audioNodesRef.current.clear();
      setPublishing(false);
    };
  }, [enabled, whipUrl, localStream]);

  // Reconnect new remote audio sources as cohosts join (without restarting WHIP)
  useEffect(() => {
    const ctx = audioCtxRef.current; const dest = audioDestRef.current;
    if (!ctx || !dest) return;
    for (const r of remotes) {
      if (audioNodesRef.current.has(r.userId)) continue;
      const at = r.stream.getAudioTracks();
      if (at.length === 0) continue;
      try {
        const src = ctx.createMediaStreamSource(new MediaStream(at));
        src.connect(dest);
        audioNodesRef.current.set(r.userId, src);
      } catch {}
    }
  }, [remotes]);

  return { publishing, error, canvas: canvasRef.current };
}

// ─── Layout helpers ──────────────────────────────────────────────────────
type Rect = { x: number; y: number; w: number; h: number };

function layoutTiles(n: number): Rect[] {
  if (n <= 1) return [{ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }];
  if (n === 2) {
    const w = CANVAS_W / 2;
    return [{ x: 0, y: 0, w, h: CANVAS_H }, { x: w, y: 0, w, h: CANVAS_H }];
  }
  if (n === 3) {
    // Main left (2/3), two stacked right (1/3)
    const mainW = (CANVAS_W * 2) / 3;
    const sideW = CANVAS_W - mainW;
    const sideH = CANVAS_H / 2;
    return [
      { x: 0, y: 0, w: mainW, h: CANVAS_H },
      { x: mainW, y: 0, w: sideW, h: sideH },
      { x: mainW, y: sideH, w: sideW, h: sideH },
    ];
  }
  // 4: 2x2
  const w = CANVAS_W / 2; const h = CANVAS_H / 2;
  return [
    { x: 0, y: 0, w, h }, { x: w, y: 0, w, h },
    { x: 0, y: h, w, h }, { x: w, y: h, w, h },
  ];
}

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  const sw = v.videoWidth; const sh = v.videoHeight;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale; const dh = sh * scale;
  const dx = x + (w - dw) / 2; const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(v, dx, dy, dw, dh);
  ctx.restore();
  // Tile border
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
