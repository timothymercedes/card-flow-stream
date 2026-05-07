import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";

type Tier = {
  tier: string;
  inactive_warning_minutes: number;
  inactive_auto_end_minutes: number;
  flex_soft_limit_minutes: number;
  flex_extension_minutes: number;
  guest_limit: number;
  priority_stream_quality: boolean;
  enhanced_obs_features: boolean;
};

const DEFAULT_TIER: Tier = {
  tier: "standard",
  inactive_warning_minutes: 30,
  inactive_auto_end_minutes: 40,
  flex_soft_limit_minutes: 180,
  flex_extension_minutes: 120,
  guest_limit: 4,
  priority_stream_quality: false,
  enhanced_obs_features: false,
};

export function useLivestreamSafety(opts: {
  stream: any;
  streamId: string;
  isSeller: boolean;
  localStream?: MediaStream | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onAutoEnd?: () => void;
}) {
  const { stream, streamId, isSeller, localStream, videoRef, onAutoEnd } = opts;
  const [tier, setTier] = useState<Tier>(DEFAULT_TIER);
  const [mediaActive, setMediaActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lastTouchRef = useRef(0);
  const lastAudioRef = useRef(0);
  const lastFrameRef = useRef<{ at: number; value: number }>({ at: 0, value: 0 });
  const autoEndedRef = useRef(false);

  useEffect(() => {
    const key = (stream?.creator_tier as string) || "standard";
    supabase.from("creator_stream_tiers" as any).select("*").eq("tier", key).maybeSingle()
      .then(({ data }) => setTier((data as unknown as Tier) || DEFAULT_TIER));
  }, [stream?.creator_tier]);

  const startedAt = stream?.started_at ? new Date(stream.started_at).getTime() : 0;
  const lastActivityAt = stream?.last_activity_at ? new Date(stream.last_activity_at).getTime() : startedAt;
  const warnAt = lastActivityAt + tier.inactive_warning_minutes * 60_000;
  const autoEndAt = lastActivityAt + tier.inactive_auto_end_minutes * 60_000;
  const flexReminderAt = startedAt + tier.flex_soft_limit_minutes * 60_000;
  const flexExtendedUntil = stream?.flex_extended_until ? new Date(stream.flex_extended_until).getTime() : 0;
  const now = Date.now();

  const inactiveWarning = !!stream && stream.status === "live" && now >= warnAt && now < autoEndAt;
  const autoEndDue = !!stream && stream.status === "live" && now >= autoEndAt;
  const flexReminder = !!stream && stream.status === "live" && stream.stream_type === "show_off" && startedAt > 0 && now >= Math.max(flexReminderAt, flexExtendedUntil || 0);

  async function touch(type = "activity") {
    if (!streamId || Date.now() - lastTouchRef.current < 20_000) return;
    lastTouchRef.current = Date.now();
    await (supabase.rpc as any)("touch_live_stream_activity", { _stream_id: streamId, _activity_type: type });
  }

  async function confirmActive() {
    if (!isSeller || !streamId) return;
    setConfirming(true);
    await (supabase.rpc as any)("confirm_live_stream_active", { _stream_id: streamId });
    setConfirming(false);
  }

  async function extendFlex() {
    if (!isSeller || !streamId) return null;
    const { data } = await (supabase.rpc as any)("extend_flex_live_session", { _stream_id: streamId });
    return data as string | null;
  }

  useEffect(() => {
    if (!isSeller || !streamId || stream?.status !== "live") return;
    const iv = setInterval(() => {
      (supabase.rpc as any)("apply_live_stream_safety", { _stream_id: streamId }).then(({ data }: any) => {
        if (data && autoEndDue && !autoEndedRef.current) {
          autoEndedRef.current = true;
          onAutoEnd?.();
        }
      });
    }, 60_000);
    return () => clearInterval(iv);
  }, [isSeller, streamId, stream?.status, autoEndDue, onAutoEnd]);

  useEffect(() => {
    if (!isSeller || !localStream || stream?.status !== "live") return;
    const audio = localStream.getAudioTracks()[0];
    if (!audio) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(new MediaStream([audio]));
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const iv = setInterval(() => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / Math.max(1, data.length);
      if (avg > 4) {
        lastAudioRef.current = Date.now();
        setMediaActive(true);
        touch("microphone");
      }
    }, 5000);
    return () => { clearInterval(iv); ctx.close().catch(() => {}); };
  }, [isSeller, localStream, stream?.status]);

  useEffect(() => {
    if (!isSeller || stream?.status !== "live") return;
    const iv = setInterval(() => {
      const v = videoRef?.current;
      if (!v || !v.videoWidth || !v.currentTime) return;
      const moved = Math.abs(v.currentTime - lastFrameRef.current.value) > 0.2;
      lastFrameRef.current = { at: Date.now(), value: v.currentTime };
      if (moved) {
        setMediaActive(true);
        touch("camera");
      }
    }, 15_000);
    return () => clearInterval(iv);
  }, [isSeller, stream?.status, videoRef]);

  const statusLabel = useMemo(() => {
    if (!stream?.last_activity_at) return "Starting";
    const mins = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 60_000));
    if (mins < 1) return "Active now";
    return `Active ${mins}m ago`;
  }, [stream?.last_activity_at, lastActivityAt]);

  return { tier, inactiveWarning, autoEndDue, flexReminder, mediaActive, confirming, statusLabel, touch, confirmActive, extendFlex };
}