/**
 * HostInactivityCheckModal — appears when the host has been inactive
 * past the warning threshold. Big "I'm still here" button calls
 * confirm_live_stream_active. Ignoring it lets the cron sweep_inactive_streams
 * auto-end the stream after the auto-end threshold.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function HostInactivityCheckModal({
  open,
  autoEndAt,
  onConfirm,
  onDismiss,
}: {
  open: boolean;
  /** epoch ms — when the stream will auto-end if no confirm */
  autoEndAt: number | null;
  onConfirm: () => Promise<void> | void;
  onDismiss?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [open]);

  if (!open) return null;

  const msLeft = autoEndAt ? Math.max(0, autoEndAt - now) : 0;
  const mins = Math.floor(msLeft / 60_000);
  const secs = Math.floor((msLeft % 60_000) / 1000);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-amber-500/20 via-card to-card p-5 text-center shadow-2xl ring-1 ring-amber-500/40">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-2 ring-amber-500/50">
          <AlertTriangle className="h-6 w-6 text-amber-300" />
        </div>
        <h2 className="mb-1 text-lg font-extrabold">Are you still there?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          We haven't detected activity in a while. Tap below to keep your stream live —
          otherwise it'll auto-end{" "}
          {autoEndAt ? (
            <span className="font-bold text-amber-300">
              in {mins}:{secs.toString().padStart(2, "0")}
            </span>
          ) : (
            "shortly"
          )}
          .
        </p>

        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(); } finally { setBusy(false); }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-extrabold text-black shadow-lg ring-2 ring-emerald-300 transition active:scale-[0.98] disabled:opacity-60"
        >
          <CheckCircle2 className="h-5 w-5" />
          {busy ? "Confirming…" : "I'm still here"}
        </button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Remind me again later
          </button>
        )}
      </div>
    </div>
  );
}
