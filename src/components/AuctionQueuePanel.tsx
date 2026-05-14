import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Play, ChevronUp, ChevronDown, ListOrdered, RotateCw } from "lucide-react";

type QueueItem = {
  id: string;
  stream_id: string;
  host_id: string;
  position: number;
  title: string;
  image_url: string | null;
  starting_bid: number;
  duration_seconds: number;
  snipe_price: number | null;
  status: "queued" | "running" | "sold" | "unsold" | "skipped";
  quantity?: number | null;
};

/**
 * AuctionQueuePanel — host preloads items before going live; viewers see "up next".
 *
 * - Host mode: full CRUD (add/remove/reorder), one-tap "Start" applies the
 *   item's params to the live_streams row and starts the round.
 * - Viewer mode: read-only "Up next" preview of the first 3 queued items.
 * - Quick-relist: any item with status='unsold' shows a relist button that
 *   resets it to 'queued' and bumps it to the top.
 */
export function AuctionQueuePanel({
  streamId,
  hostId,
  isHost,
  auctionLive,
  onStart,
}: {
  streamId: string;
  hostId: string;
  isHost: boolean;
  auctionLive: boolean;
  onStart?: (item: QueueItem) => Promise<void> | void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", starting_bid: 1, duration_seconds: 30, snipe_price: "", quantity: 1 });

  useEffect(() => {
    if (!streamId) return;
    let alive = true;

    async function refresh() {
      const { data } = await supabase
        .from("auction_queue" as any)
        .select("*")
        .eq("stream_id", streamId)
        .order("position", { ascending: true });
      if (alive) setItems((data as any[] as QueueItem[]) || []);
    }
    refresh();

    const ch = supabase
      .channel(`queue-${streamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_queue", filter: `stream_id=eq.${streamId}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [streamId]);

  async function addItem() {
    if (!isHost) return;
    const title = draft.title.trim();
    if (!title) return toast.error("Add a title");
    const start = Number(draft.starting_bid) || 1;
    const dur = Math.max(10, Math.min(600, Number(draft.duration_seconds) || 30));
    const snipe = draft.snipe_price ? Number(draft.snipe_price) : null;
    const qty = Math.max(1, Math.min(999, Number(draft.quantity) || 1));
    const nextPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { error } = await supabase.from("auction_queue" as any).insert({
      stream_id: streamId,
      host_id: hostId,
      position: nextPos,
      title,
      starting_bid: start,
      duration_seconds: dur,
      snipe_price: snipe,
      quantity: qty,
    } as any);
    if (error) return toast.error(error.message);
    setDraft({ title: "", starting_bid: 1, duration_seconds: 30, snipe_price: "", quantity: 1 });
    setAdding(false);
  }

  async function remove(id: string) {
    await supabase.from("auction_queue" as any).delete().eq("id", id);
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx], b = items[swapIdx];
    await Promise.all([
      supabase.from("auction_queue" as any).update({ position: b.position }).eq("id", a.id),
      supabase.from("auction_queue" as any).update({ position: a.position }).eq("id", b.id),
    ]);
  }

  async function startItem(item: QueueItem) {
    if (!isHost) return;
    if (auctionLive) return toast.error("Finish current round first");
    await supabase
      .from("auction_queue" as any)
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", item.id);
    await onStart?.(item);
  }

  async function relist(item: QueueItem) {
    if (!isHost) return;
    const minPos = items.length > 0 ? Math.min(...items.map((i) => i.position)) - 1 : 0;
    await supabase
      .from("auction_queue" as any)
      .update({ status: "queued", position: minPos, started_at: null, finished_at: null, winning_bid: null, winner_id: null })
      .eq("id", item.id);
    toast.success("Relisted to top of queue");
  }

  const queued = items.filter((i) => i.status === "queued");
  const unsold = items.filter((i) => i.status === "unsold");

  // Viewer mode: tiny "Up next" strip
  if (!isHost) {
    if (queued.length === 0) return null;
    return (
      <div className="rounded-xl bg-black/55 px-3 py-2 text-white backdrop-blur ring-1 ring-white/10">
        <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-white/60">
          <ListOrdered className="h-3 w-3" /> Up next ({queued.length})
        </p>
        <div className="flex items-center gap-2 overflow-x-auto">
          {queued.slice(0, 4).map((it, i) => (
            <div key={it.id} className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[11px]">
              <span className="mr-1 font-extrabold text-amber-300">#{i + 1}</span>
              <span className="font-semibold">{it.title}</span>
              {Number(it.quantity || 1) > 1 && <span className="ml-1 text-fuchsia-300">×{it.quantity}</span>}
              <span className="ml-1 opacity-70">· ${Number(it.starting_bid).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-black/70 p-3 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/70">
          <ListOrdered className="h-3 w-3" /> Auction queue ({queued.length})
        </p>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-1 text-[10px] font-bold text-white"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="space-y-1.5 rounded-lg bg-white/5 p-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Card / item title"
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-xs placeholder:text-white/40 focus:outline-none"
          />
          <div className="grid grid-cols-4 gap-1.5">
            <label className="text-[9px] uppercase text-white/60">Start $
              <input type="number" min={1} value={draft.starting_bid}
                onChange={(e) => setDraft((d) => ({ ...d, starting_bid: Number(e.target.value) }))}
                className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
            </label>
            <label className="text-[9px] uppercase text-white/60">Sec
              <input type="number" min={10} value={draft.duration_seconds}
                onChange={(e) => setDraft((d) => ({ ...d, duration_seconds: Number(e.target.value) }))}
                className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
            </label>
            <label className="text-[9px] uppercase text-white/60">Buy-now
              <input type="number" placeholder="—" value={draft.snipe_price}
                onChange={(e) => setDraft((d) => ({ ...d, snipe_price: e.target.value }))}
                className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
            </label>
            <label className="text-[9px] uppercase text-white/60">Qty
              <input type="number" min={1} max={999} value={draft.quantity}
                onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
                className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={addItem} className="flex-1 rounded-md bg-emerald-500 px-2 py-1.5 text-[11px] font-bold">
              Save to queue
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md bg-white/10 px-3 py-1.5 text-[11px]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {queued.length === 0 && !adding && (
        <p className="rounded-lg bg-white/5 p-2 text-center text-[11px] text-white/50">
          Queue is empty. Tap Add to preload items before going live.
        </p>
      )}

      {queued.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
          <span className="font-extrabold text-amber-300 text-[11px] tabular-nums w-5">#{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{it.title}</p>
            <p className="text-[10px] text-white/60">
              ${Number(it.starting_bid).toFixed(0)} · {it.duration_seconds}s
              {it.snipe_price ? ` · BIN $${Number(it.snipe_price).toFixed(0)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => move(it.id, -1)} disabled={i === 0}
              className="rounded p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
            <button onClick={() => move(it.id, 1)} disabled={i === queued.length - 1}
              className="rounded p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
            <button onClick={() => startItem(it)} disabled={auctionLive}
              title={auctionLive ? "Finish current round first" : "Start this item"}
              className="rounded-md bg-emerald-500 p-1.5 text-white disabled:opacity-40"><Play className="h-3 w-3" /></button>
            <button onClick={() => remove(it.id)} className="rounded p-1 text-white/60 hover:bg-rose-500/30 hover:text-rose-200">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}

      {unsold.length > 0 && (
        <div className="space-y-1 border-t border-white/10 pt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-rose-300/80">Unsold ({unsold.length}) — quick relist</p>
          {unsold.map((it) => (
            <div key={it.id} className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-1.5 ring-1 ring-rose-500/30">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">{it.title}</p>
                <p className="text-[9px] text-white/50">${Number(it.starting_bid).toFixed(0)} · {it.duration_seconds}s</p>
              </div>
              <button onClick={() => relist(it)} className="flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-black">
                <RotateCw className="h-3 w-3" /> Relist
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
