/**
 * Centralized realtime helpers with:
 *  - automatic reconnect + exponential backoff
 *  - deduplicated channel names per session
 *  - global connection-status broadcaster
 *  - safe cleanup (no leaks if effect re-runs)
 *
 * Use `useRealtimeChannel` instead of calling `supabase.channel(...)` directly
 * so every subscription benefits from reconnect + status tracking.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordError, recordMetric } from "@/lib/perfMonitor";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

// ---------- Global status store ----------
let _status: RealtimeStatus = "connecting";
const _listeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (_status === next) return;
  _status = next;
  _listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

function subscribe(l: () => void) {
  _listeners.add(l);
  return () => _listeners.delete(l);
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    subscribe,
    () => _status,
    () => "connecting" as RealtimeStatus,
  );
}

// ---------- Active channel registry (de-dup + offline awareness) ----------
const activeChannels = new Map<string, number>(); // name -> ref count

if (typeof window !== "undefined") {
  // Translate browser online/offline into our status
  window.addEventListener("online", () => {
    setStatus(activeChannels.size > 0 ? "reconnecting" : "connected");
  });
  window.addEventListener("offline", () => setStatus("disconnected"));

  // Refresh realtime auth + reconnect on tab wake
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine === false) {
      setStatus("disconnected");
    }
  });
}

// ---------- Channel hook ----------
type SetupFn = (ch: RealtimeChannel) => RealtimeChannel;

type Options = {
  /** Stable channel name. If omitted, must pass `key`. */
  name: string;
  /** Skip subscription entirely (e.g. when deps not ready). */
  enabled?: boolean;
  /** Max backoff in ms — defaults to 30s. */
  maxBackoffMs?: number;
};

/**
 * Subscribe to a Supabase realtime channel with auto-reconnect + status reporting.
 *
 *   useRealtimeChannel({ name: `notif-${userId}`, enabled: !!userId }, (ch) =>
 *     ch.on("postgres_changes", { event: "*", ... }, () => load())
 *   );
 */
export function useRealtimeChannel(opts: Options, setup: SetupFn) {
  const { name, enabled = true, maxBackoffMs = 30_000 } = opts;
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    const connect = () => {
      if (cancelled) return;

      // De-dupe: if a channel with the same name already exists, remove it first
      try {
        const existing = supabase.getChannels?.().find((c) => c.topic.endsWith(name));
        if (existing) supabase.removeChannel(existing);
      } catch { /* ignore */ }

      const start = performance.now();
      const ch = supabase.channel(name);
      const wired = setupRef.current(ch);
      channel = wired;

      wired.subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          setStatus("connected");
          recordMetric({
            route: `realtime:${name}`,
            kind: "ws",
            duration_ms: performance.now() - start,
            status_code: 200,
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (cancelled) return;
          if (err) {
            recordError({
              source: "client",
              severity: "warning",
              route: `realtime:${name}`,
              message: `Realtime ${status}: ${String((err as any)?.message ?? err)}`,
              metadata: { kind: "ws_disconnect", status },
            });
          }
          setStatus(navigator.onLine === false ? "disconnected" : "reconnecting");
          // Exponential backoff: 500ms, 1s, 2s, 4s, ... capped
          const delay = Math.min(maxBackoffMs, 500 * 2 ** Math.min(attempt, 6))
            + Math.floor(Math.random() * 250);
          attempt += 1;
          retryTimer = setTimeout(() => {
            try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
            channel = null;
            connect();
          }, delay);
        }
      });

      activeChannels.set(name, (activeChannels.get(name) ?? 0) + 1);
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      const refs = (activeChannels.get(name) ?? 1) - 1;
      if (refs <= 0) activeChannels.delete(name);
      else activeChannels.set(name, refs);
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled]);
}

// ---------- Status indicator UI ----------
export function useShouldShowReconnectBanner() {
  const status = useRealtimeStatus();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status === "connected" || status === "connecting") {
      setShow(false);
      return;
    }
    // Only show after 2s — avoids flashing on quick blips
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, [status]);
  return { status, show };
}
