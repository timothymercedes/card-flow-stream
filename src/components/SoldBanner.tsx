import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

/**
 * Auto-sold banner. Shows a big animated overlay for ~3.5s when an auction
 * round finalizes with a winner. Triggered by bumping the `triggerKey` prop
 * (e.g. set it to round_number).
 */
export function SoldBanner({
  triggerKey,
  itemName,
  winnerUsername,
  amount,
}: {
  triggerKey: string | number | null | undefined;
  itemName: string;
  winnerUsername: string;
  amount: number;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (triggerKey === null || triggerKey === undefined || triggerKey === "") return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [triggerKey]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="animate-[sold-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)] mx-4 flex w-full max-w-md flex-col items-center gap-2 rounded-3xl bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600 px-6 py-5 text-center text-white shadow-2xl ring-4 ring-white/30">
        <Trophy className="h-10 w-10 drop-shadow-lg" />
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] opacity-90">SOLD!</p>
        <p className="line-clamp-2 text-base font-extrabold leading-tight drop-shadow-md">
          {itemName}
        </p>
        <p className="text-sm font-bold opacity-95">
          to <span className="font-extrabold">@{winnerUsername}</span>
        </p>
        <p className="rounded-full bg-black/30 px-4 py-1 text-2xl font-black tabular-nums">
          ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}
