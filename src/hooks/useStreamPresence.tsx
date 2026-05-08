import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

export type PresenceUser = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  last_seen_at: string;
};

const IDLE_MS = 60_000; // 1 minute -> drop from list

/**
 * Tracks who is currently watching a live stream.
 * - Heartbeats current user every 20s into live_stream_presence.
 * - Subscribes to realtime presence changes.
 * - Filters out anyone whose last_seen_at is older than 60s.
 */
export function useStreamPresence(streamId: string | null, userId: string | null, username: string | null, avatarUrl: string | null) {
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [tick, setTick] = useState(0);

  // Local clock so we can re-filter idle viewers without server roundtrip
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Heartbeat
  useEffect(() => {
    if (!streamId || !userId || !username) return;
    let cancelled = false;
    async function beat() {
      if (cancelled) return;
      await supabase.from("live_stream_presence").upsert(
        [{ stream_id: streamId!, user_id: userId!, username: username!, avatar_url: avatarUrl, last_seen_at: new Date().toISOString() }],
        { onConflict: "stream_id,user_id" },
      );
    }
    beat();
    const i = setInterval(beat, 20_000);
    // Refresh immediately when the tab becomes visible/focused again,
    // so users returning from background don't appear offline.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      // Best-effort remove on unmount
      supabase.from("live_stream_presence").delete().eq("stream_id", streamId).eq("user_id", userId);
    };
  }, [streamId, userId, username, avatarUrl]);

  // Initial load + realtime
  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("live_stream_presence").select("*").eq("stream_id", streamId!);
      if (!cancelled) setViewers((data as any) || []);
    }
    load();
    const ch = supabase.channel(`presence-db-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_stream_presence", filter: `stream_id=eq.${streamId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [streamId]);

  // Filter idle
  const now = Date.now();
  const active = viewers.filter((v) => now - new Date(v.last_seen_at).getTime() < IDLE_MS);
  // tick is read so the linter knows we depend on it for idle filtering
  void tick;
  return { viewers: active, count: active.length };
}
