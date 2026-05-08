import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Radio, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeChannel } from "@/lib/realtime";

/**
 * Permanent host-only floating button. If the signed-in user has an
 * active (live or paused) stream, shows a pulsing red badge with a
 * one-tap rejoin button — so a host who accidentally leaves the
 * stream page can return from Seller Hub, Profile, Dashboard, etc.
 */
export function ReturnToLiveBadge() {
  const { user } = useAuth();
  const loc = useLocation();
  const [stream, setStream] = useState<{ id: string; title: string | null; status: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const onLivePage = loc.pathname.startsWith("/live/") && loc.pathname !== "/live" && loc.pathname !== "/live/";

  async function refresh() {
    if (!user) { setStream(null); return; }
    const { data } = await supabase
      .from("live_streams")
      .select("id, title, status")
      .eq("seller_id", user.id)
      .in("status", ["live", "paused"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setStream((data as any) || null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Refresh when stream rows for this seller change.
  useRealtimeChannel(
    { name: `host-active-${user?.id ?? "none"}`, enabled: !!user },
    (ch) =>
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "live_streams", filter: `seller_id=eq.${user?.id ?? ""}` },
        () => refresh(),
      ),
  );

  if (!user || !stream || onLivePage || dismissed) return null;

  const paused = stream.status === "paused";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-live/40 bg-background/95 p-2 shadow-lg backdrop-blur">
        <span className="relative flex h-3 w-3 shrink-0">
          {!paused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${paused ? "bg-amber-500" : "bg-live"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-live">
            {paused ? "Paused" : "You're live now"}
          </p>
          <p className="truncate text-xs font-semibold">{stream.title || "Your stream"}</p>
        </div>
        <Link
          to="/live/$id"
          params={{ id: stream.id }}
          className="rounded-full bg-live px-3 py-2 text-[11px] font-bold text-live-foreground"
        >
          Return →
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Hide for now"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Inline pill for Profile / Seller Hub / Dashboard pages. */
export function LiveNowPill() {
  const { user } = useAuth();
  const [stream, setStream] = useState<{ id: string; title: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("live_streams")
      .select("id, title")
      .eq("seller_id", user.id)
      .in("status", ["live", "paused"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setStream((data as any) || null));
  }, [user?.id]);

  if (!stream) return null;

  return (
    <Link
      to="/live/$id"
      params={{ id: stream.id }}
      className="flex items-center justify-between gap-2 rounded-xl border border-live/40 bg-live/10 p-3"
    >
      <span className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
        </span>
        <span className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-live">Live now</span>
          <span className="truncate text-xs font-semibold">{stream.title || "Your stream"}</span>
        </span>
      </span>
      <span className="rounded-full bg-live px-3 py-1.5 text-[11px] font-bold text-live-foreground">
        <Radio className="mr-1 inline h-3 w-3" /> Rejoin
      </span>
    </Link>
  );
}
