/**
 * useStreamShipping — single source of truth for the host-selected
 * shipping price + method on a live stream. Subscribes to realtime updates
 * so buyers/viewers see the host's chosen rate immediately when it changes.
 *
 *   const { price, method, label, loading } = useStreamShipping(streamId);
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

export type StreamShipping = {
  price: number;
  method: string;
  /** "USPS Ground · $4.95" style; "Set by host" when host hasn't picked yet */
  label: string;
  loading: boolean;
};

export function useStreamShipping(streamId: string | null | undefined): StreamShipping {
  const [price, setPrice] = useState(0);
  const [method, setMethod] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("live_streams")
        .select("shipping_price, shipping_method")
        .eq("id", streamId)
        .maybeSingle();
      if (cancelled || !data) return;
      setPrice(Number((data as any).shipping_price || 0));
      setMethod((data as any).shipping_method || "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [streamId]);

  useRealtimeChannel(
    { name: `stream-ship-${streamId ?? "none"}`, enabled: !!streamId },
    (ch) =>
      ch.on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId ?? ""}` },
        (payload: any) => {
          const n = payload.new || {};
          if ("shipping_price" in n) setPrice(Number(n.shipping_price || 0));
          if ("shipping_method" in n) setMethod(n.shipping_method || "");
        },
      ),
  );

  const label = price > 0
    ? `${method || "Shipping"} · $${price.toFixed(2)}`
    : "Set by host";

  return { price, method, label, loading };
}
