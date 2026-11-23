import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import Hls from "hls.js";
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { playbackHasFrames, playbackRetryDelay, PLAYBACK_MAX_RECOVERIES, PLAYBACK_STALL_MS, type PlaybackState } from '@/lib/playbackState';

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
  onPlaybackState?: (state: PlaybackState) => void;
}>(function HlsPlayer({ src, className, muted = false, autoPlay = true, controls = false, style, onVideoMetrics, onPlaybackState }, externalRef) {
  const ref = useRef<HTMLVideoElement>(null);
  const metricsRef = useRef(onVideoMetrics);
  const [state, setState] = useState<PlaybackState>('connecting');
  const [restart, setRestart] = useState(0);
  useEffect(() => { onPlaybackState?.(state); }, [state, onPlaybackState]);

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
    let lastProgress = Date.now();
    let lastTime = -1;
    let hasPlayed = false;
    // Chromium may advertise HLS support but still reject live manifests.
    // Use hls.js whenever MediaSource is available; iOS falls back to native HLS.
    const useNative = !Hls.isSupported();
    setState('connecting');

    const attemptPlay = () => {
      if (autoPlay) void video.play().catch(() => {
        // iOS and Android require muted inline playback before a user gesture.
        video.muted = true;
        void video.play().catch(() => { if (!destroyed) setState(hasPlayed ? 'reconnecting' : 'connecting'); });
      });
    };
    const recover = () => {
      if (destroyed || recoverTimer) return;
      setState(hasPlayed ? 'reconnecting' : 'connecting');
      recoverAttempts += 1;
      if (recoverAttempts > PLAYBACK_MAX_RECOVERIES) {
        setState('failed');
        return;
      }
      recoverTimer = setTimeout(() => {
        recoverTimer = null;
        if (destroyed) return;
        lastProgress = Date.now();
        hls?.destroy();
        hls = null;
        if (!useNative) startHls();
        else startNative();
        attemptPlay();
      }, playbackRetryDelay(recoverAttempts));
    };
    const progress = () => {
      if (!playbackHasFrames(video) || video.currentTime === lastTime) return;
      hasPlayed = true;
      lastTime = video.currentTime;
      lastProgress = Date.now();
      recoverAttempts = 0;
      if (recoverTimer) clearTimeout(recoverTimer);
      recoverTimer = null;
      setState('live');
    };
    const waiting = () => setState(hasPlayed ? 'reconnecting' : 'connecting');
    const foreground = () => {
      if (document.visibilityState === 'visible') { attemptPlay(); if (Date.now() - lastProgress > PLAYBACK_STALL_MS) recover(); }
    };

    const reportMetrics = () => {
      const metrics = inspectVideoFrame(video);
      if (metrics) metricsRef.current?.(metrics);
    };

    const startNative = () => {
      video.src = src;
      video.load();
    };

    const startHls = () => {
      // Detect weak connections (2g/3g/save-data) and degrade gracefully:
      // cap bitrate, increase buffer headroom so the player rides out blips.
      const conn: any = typeof navigator !== "undefined" ? (navigator as any).connection : null;
      const eff: string = conn?.effectiveType || "";
      const saveData: boolean = !!conn?.saveData;
      const isWeak = saveData || eff === "2g" || eff === "slow-2g" || eff === "3g";
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: !isWeak, // weak networks: prefer stability over low latency
        backBufferLength: 30,    // smoother seek/recovery without ballooning memory
        maxBufferLength: isWeak ? 20 : 12,
        maxMaxBufferLength: isWeak ? 60 : 30,
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
        // Aggressive retry: tolerate brief network blips
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 6,
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal || destroyed || !hls) return;
        recover();
      });
      hls.on(Hls.Events.MANIFEST_PARSED, attemptPlay);
      hls.loadSource(src);
      hls.attachMedia(video);
    };

    if (!useNative) {
      startHls();
    } else {
      startNative();
    }

    video.addEventListener("loadedmetadata", reportMetrics);
    video.addEventListener("loadeddata", reportMetrics);
    video.addEventListener("resize", reportMetrics);
    video.addEventListener('timeupdate', progress);
    video.addEventListener('playing', progress);
    video.addEventListener('waiting', waiting);
    video.addEventListener('stalled', waiting);
    video.addEventListener('error', recover);
    video.addEventListener('loadeddata', attemptPlay);
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', foreground);
    metricsTimer = setInterval(() => {
      reportMetrics();
      if (Date.now() - lastProgress > PLAYBACK_STALL_MS && recoverAttempts <= PLAYBACK_MAX_RECOVERIES) recover();
    }, 2000);

    attemptPlay();

    return () => {
      destroyed = true;
      if (recoverTimer) clearTimeout(recoverTimer);
      if (metricsTimer) clearInterval(metricsTimer);
      video.removeEventListener("loadedmetadata", reportMetrics);
      video.removeEventListener("loadeddata", reportMetrics);
      video.removeEventListener("resize", reportMetrics);
      video.removeEventListener('timeupdate', progress);
      video.removeEventListener('playing', progress);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('stalled', waiting);
      video.removeEventListener('error', recover);
      video.removeEventListener('loadeddata', attemptPlay);
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', foreground);
      try { hls?.destroy(); } catch {}
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, autoPlay, restart]);

  return <div className="relative h-full w-full">
    <video ref={ref} className={className} style={style} crossOrigin="anonymous" playsInline muted={muted} controls={controls} autoPlay={autoPlay} />
    {state !== 'live' && <div role="status" aria-live="polite" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center text-foreground">
      {state === 'failed' ? <RefreshCw className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
      <p className="font-semibold">{state === 'failed' ? 'Failed to connect' : state === 'reconnecting' ? 'Reconnecting' : 'Connecting'}</p>
      {state === 'failed' && <Button onClick={() => setRestart(value => value + 1)}><RefreshCw className="h-4 w-4" /> Retry playback</Button>}
    </div>}
    {state === 'live' && <span className="pointer-events-none absolute left-3 top-3 rounded bg-live px-2 py-1 text-xs font-bold text-live-foreground">Live</span>}
  </div>;
});
