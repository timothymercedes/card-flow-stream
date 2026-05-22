import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import Hls from "hls.js";

export type HlsVideoMetrics = {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: "vertical" | "horizontal" | "square";
  activeAreaRatio: number | null;
  activeWidthRatio: number | null;
  activeHeightRatio: number | null;
  activeCenterX: number | null;
  activeCenterY: number | null;
  recommendedZoom: number;
  hasLargeBlackBorders: boolean;
  canAnalyzeFrame: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inspectVideoFrame(video: HTMLVideoElement): HlsVideoMetrics | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const aspectRatio = width / height;
  const orientation = aspectRatio > 1.08 ? "horizontal" : aspectRatio < 0.92 ? "vertical" : "square";
  const base: HlsVideoMetrics = {
    width,
    height,
    aspectRatio,
    orientation,
    activeAreaRatio: null,
    activeWidthRatio: null,
    activeHeightRatio: null,
    activeCenterX: null,
    activeCenterY: null,
    recommendedZoom: 1,
    hasLargeBlackBorders: false,
    canAnalyzeFrame: false,
  };

  try {
    const sampleW = 96;
    const sampleH = clamp(Math.round(sampleW / aspectRatio), 54, 170);
    const canvas = document.createElement("canvas");
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return base;

    ctx.drawImage(video, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
    let minX = sampleW;
    let minY = sampleH;
    let maxX = -1;
    let maxY = -1;
    let activePixels = 0;

    for (let y = 0; y < sampleH; y += 1) {
      for (let x = 0; x < sampleW; x += 1) {
        const i = (y * sampleW + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (luma > 24 || chroma > 18) {
          activePixels += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (activePixels < sampleW * sampleH * 0.03 || maxX < minX || maxY < minY) {
      return { ...base, canAnalyzeFrame: true };
    }

    const activeW = maxX - minX + 1;
    const activeH = maxY - minY + 1;
    const activeAreaRatio = (activeW * activeH) / (sampleW * sampleH);
    const activeWidthRatio = activeW / sampleW;
    const activeHeightRatio = activeH / sampleH;
    const recommendedZoom = activeAreaRatio < 0.82 ? clamp(Math.max(1 / activeWidthRatio, 1 / activeHeightRatio), 1, 2.8) : 1;

    return {
      ...base,
      activeAreaRatio,
      activeWidthRatio,
      activeHeightRatio,
      activeCenterX: ((minX + activeW / 2) / sampleW) * 100,
      activeCenterY: ((minY + activeH / 2) / sampleH) * 100,
      recommendedZoom,
      hasLargeBlackBorders: recommendedZoom > 1.12 && activeAreaRatio < 0.82,
      canAnalyzeFrame: true,
    };
  } catch {
    return base;
  }
}

export const HlsPlayer = forwardRef<HTMLVideoElement, {
  src: string;
  className?: string;
  muted?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  style?: CSSProperties;
  onVideoMetrics?: (metrics: HlsVideoMetrics) => void;
}>(function HlsPlayer({ src, className, muted = false, autoPlay = true, controls = false, style, onVideoMetrics }, externalRef) {
  const ref = useRef<HTMLVideoElement>(null);
  const metricsRef = useRef(onVideoMetrics);

  useImperativeHandle(externalRef, () => ref.current as HTMLVideoElement, []);

  useEffect(() => {
    metricsRef.current = onVideoMetrics;
  }, [onVideoMetrics]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    let destroyed = false;
    let recoverTimer: ReturnType<typeof setTimeout> | null = null;
    let recoverAttempts = 0;
    let metricsTimer: ReturnType<typeof setInterval> | null = null;

    const reportMetrics = () => {
      const metrics = inspectVideoFrame(video);
      if (metrics) metricsRef.current?.(metrics);
    };

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

    video.addEventListener("loadedmetadata", reportMetrics);
    video.addEventListener("loadeddata", reportMetrics);
    video.addEventListener("resize", reportMetrics);
    metricsTimer = setInterval(reportMetrics, 2000);

    if (autoPlay) video.play().catch(() => {});

    return () => {
      destroyed = true;
      if (recoverTimer) clearTimeout(recoverTimer);
      if (metricsTimer) clearInterval(metricsTimer);
      video.removeEventListener("loadedmetadata", reportMetrics);
      video.removeEventListener("loadeddata", reportMetrics);
      video.removeEventListener("resize", reportMetrics);
      try { hls?.destroy(); } catch {}
    };
  }, [src, autoPlay]);

  return <video ref={ref} className={className} style={style} crossOrigin="anonymous" playsInline muted={muted} controls={controls} autoPlay={autoPlay} />;
});
