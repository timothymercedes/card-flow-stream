/**
 * Lightweight wrapper around useRealtimeChannel for a single postgres_changes
 * subscription. Debounces bursts so rapid-fire updates (e.g. many bids) only
 * trigger one reload.
 *
 *   useRealtimeTable({
 *     name: `orders-buyer-${user.id}`,
 *     table: "orders",
 *     filter: `buyer_id=eq.${user.id}`,
 *     enabled: !!user,
 *   }, () => load());
 */
import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/lib/realtime";

type Opts = {
  name: string;
  table: string;
  /** PostgREST-style filter: `column=eq.value`. Optional. */
  filter?: string;
  schema?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  enabled?: boolean;
  /** Coalesce bursts (default 200ms). 0 = fire immediately. */
  debounceMs?: number;
};

export function useRealtimeTable(opts: Opts, onChange: (payload?: any) => void) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { name, table, filter, schema = "public", event = "*", enabled = true, debounceMs = 200 } = opts;

  useRealtimeChannel({ name, enabled }, (ch) =>
    ch.on(
      "postgres_changes" as any,
      { event, schema, table, ...(filter ? { filter } : {}) } as any,
      (payload: any) => {
        if (debounceMs <= 0) { cbRef.current(payload); return; }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => cbRef.current(payload), debounceMs);
      }
    )
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
}
