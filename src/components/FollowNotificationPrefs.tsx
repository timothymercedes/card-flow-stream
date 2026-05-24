import { useEffect, useState } from "react";
import { Bell, BellOff, Gavel, Package, Megaphone, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ensurePushSubscribed, pushSupported } from "@/lib/push";

type Prefs = {
  notify_on_live: boolean;
  notify_new_listing: boolean;
  notify_auction_start: boolean;
  notify_promotions: boolean;
};

export function FollowNotificationPrefs({
  userId,
  sellerId,
  initial,
  onChange,
}: {
  userId: string;
  sellerId: string;
  initial: Prefs;
  onChange?: (next: Prefs) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(initial);

  useEffect(() => setPrefs(initial), [initial.notify_on_live, initial.notify_new_listing, initial.notify_auction_start, initial.notify_promotions]);

  async function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    onChange?.(next);
    const { error } = await (supabase.from("follows") as any).update({ [key]: next[key] }).eq("follower_id", userId).eq("followee_id", sellerId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (next[key] && pushSupported()) {
      const r = await ensurePushSubscribed(userId);
      if (!r.ok) toast.error(r.reason || "Couldn't enable push");
    }
  }

  const anyOn = prefs.notify_on_live || prefs.notify_new_listing || prefs.notify_auction_start || prefs.notify_promotions;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notification preferences"
        className={`inline-flex items-center justify-center rounded-full p-1.5 ring-1 ring-border ${anyOn ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground"}`}
      >
        {anyOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-xl bg-card p-2 shadow-xl ring-1 ring-border">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Alert me when</p>
            <Row icon={Radio} label="Goes live" on={prefs.notify_on_live} onClick={() => toggle("notify_on_live")} />
            <Row icon={Package} label="Lists new items" on={prefs.notify_new_listing} onClick={() => toggle("notify_new_listing")} />
            <Row icon={Gavel} label="Starts auctions" on={prefs.notify_auction_start} onClick={() => toggle("notify_auction_start")} />
            <Row icon={Megaphone} label="Posts promotions" on={prefs.notify_promotions} onClick={() => toggle("notify_promotions")} />
          </div>
        </>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, on, onClick }: { icon: any; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted"
    >
      <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {label}</span>
      <span className={`relative inline-flex h-4 w-7 rounded-full transition ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${on ? "left-[14px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
