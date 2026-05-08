import { useShouldShowReconnectBanner } from "@/lib/realtime";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

/**
 * Tiny pill that shows when realtime is reconnecting/disconnected.
 * Stays hidden while everything is healthy.
 */
export function RealtimeStatusBadge() {
  const { status, show } = useShouldShowReconnectBanner();
  if (!show) return null;
  const isOffline = status === "disconnected";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 top-2 z-[200] -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg ${
        isOffline ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"
      }`}
    >
      {isOffline ? (
        <span className="flex items-center gap-1.5"><WifiOff className="h-3 w-3" /> Offline — reconnecting…</span>
      ) : (
        <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Reconnecting…</span>
      )}
      <span className="sr-only">{status}</span>
      <Wifi className="hidden" />
    </div>
  );
}
