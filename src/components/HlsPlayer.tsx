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
    let destroyed = false;
    let recoverTimer: ReturnType<typeof setTimeout> | null = null;
    let recoverAttempts = 0;

    const startNative = () => {
      video.src = src;
    };

    const startHls = () => {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // Aggressive retry: tolerate brief network blips
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 6,
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal || destroyed || !hls) return;
        // Recover progressively: media → network → full restart
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); return; } catch {}
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); return; } catch {}
        }
        // Last resort: tear down & rebuild after backoff
        recoverAttempts += 1;
        const delay = Math.min(1000 * 2 ** Math.min(recoverAttempts, 5), 15_000);
        try { hls.destroy(); } catch {}
        hls = null;
        if (recoverTimer) clearTimeout(recoverTimer);
        recoverTimer = setTimeout(() => {
          if (!destroyed) startHls();
        }, delay);
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      startNative();
    } else if (Hls.isSupported()) {
      startHls();
    } else {
      startNative();
    }

    if (autoPlay) video.play().catch(() => {});

    return () => {
      destroyed = true;
      if (recoverTimer) clearTimeout(recoverTimer);
      try { hls?.destroy(); } catch {}
    };
  }, [src, autoPlay]);

  return <video ref={ref} className={className} playsInline muted={muted} controls={controls} autoPlay={autoPlay} />;
}
