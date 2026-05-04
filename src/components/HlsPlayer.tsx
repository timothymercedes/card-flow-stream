import { useEffect, useRef } from "react";
import Hls from "hls.js";

export function HlsPlayer({ src, className, muted = false, autoPlay = true, controls = false }: {
  src: string; className?: string; muted?: boolean; autoPlay?: boolean; controls?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / iOS — native HLS
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    if (autoPlay) video.play().catch(() => {});

    return () => { hls?.destroy(); };
  }, [src, autoPlay]);

  return <video ref={ref} className={className} playsInline muted={muted} controls={controls} autoPlay={autoPlay} />;
}
