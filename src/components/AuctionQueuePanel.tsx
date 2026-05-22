import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Play, ChevronUp, ChevronDown, ListOrdered, RotateCw, ImagePlus, Eye, EyeOff, Package, Zap, Pencil, X, Library, Check } from "lucide-react";

type SaleType = "prebid" | "buynow" | "either" | "offer";

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
  prebid_enabled?: boolean;
  sale_type?: SaleType;
  buy_now_price?: number | null;
  min_offer?: number | null;
  trigger_word?: string | null;
  sold_to?: string | null;
};

type Listing = { id: string; title: string; price: number | null; image_url: string | null };
type VaultCard = { id: string; name: string; image_url: string | null; estimated_value: number | null; tcg_set: string | null; tcg_number: string | null };

/**
 * AuctionQueuePanel — host preloads items before going live; viewers see "up next".
 * Host UI supports sale type (Pre-Bid / Buy Now / Make Offer), trigger words,
 * image upload, vault import. Trigger-word quick-start lets the host start the
 * matching item by typing its trigger phrase.
 */
export function AuctionQueuePanel({
  streamId,
  hostId,
  isHost,
  auctionLive,
  onStart,
  scheduledShowId,
}: {
  streamId: string;
  hostId: string;
  isHost: boolean;
  auctionLive: boolean;
  onStart?: (item: QueueItem) => Promise<void> | void;
  /** When set, items are scoped to a scheduled show (pre-stream editing). */
  scheduledShowId?: string | null;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    sale_type: "prebid" as SaleType,
    starting_bid: 1,
    duration_seconds: 30,
    snipe_price: "",
    buy_now_price: "",
    min_offer: "",
    quantity: 1,
    image_url: "",
    trigger_word: "",
  });
  const [uploading, setUploading] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultCards, setVaultCards] = useState<VaultCard[]>([]);
  const [vaultSelected, setVaultSelected] = useState<Set<string>>(new Set());
  const [vaultAdding, setVaultAdding] = useState(false);
  const [triggerInput, setTriggerInput] = useState("");
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const [editUploading, setEditUploading] = useState(false);

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

  async function uploadImage(file: File): Promise<string | null> {
    if (!isHost) return null;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${hostId}/queue-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("show-banners").upload(path, file, { upsert: true });
    setUploading(false);
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from("show-banners").getPublicUrl(path);
    return data.publicUrl;
  }

  async function addItem() {
    if (!isHost) return;
    const title = draft.title.trim();
    if (!title) return toast.error("Add a title");
    const qty = Math.max(1, Math.min(999, Number(draft.quantity) || 1));
    const nextPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;

    const base: any = {
      stream_id: streamId,
      host_id: hostId,
      position: nextPos,
      title,
      quantity: qty,
      image_url: draft.image_url || null,
      sale_type: draft.sale_type,
      trigger_word: draft.trigger_word.trim().toLowerCase() || null,
      scheduled_show_id: scheduledShowId || null,
    };

    if (draft.sale_type === "prebid") {
      base.starting_bid = Number(draft.starting_bid) || 1;
      base.duration_seconds = Math.max(10, Math.min(600, Number(draft.duration_seconds) || 30));
      base.snipe_price = draft.snipe_price ? Number(draft.snipe_price) : null;
    } else if (draft.sale_type === "buynow") {
      const bn = Number(draft.buy_now_price);
      if (!bn || bn <= 0) return toast.error("Set a Buy Now price");
      base.starting_bid = bn;
      base.buy_now_price = bn;
      base.duration_seconds = 30;
    } else if (draft.sale_type === "either") {
      const bn = Number(draft.buy_now_price);
      if (!bn || bn <= 0) return toast.error("Set a Buy Now price");
      base.starting_bid = Number(draft.starting_bid) || 1;
      base.duration_seconds = Math.max(10, Math.min(600, Number(draft.duration_seconds) || 30));
      base.buy_now_price = bn;
      base.snipe_price = bn;
    } else {
      base.starting_bid = 1;
      base.duration_seconds = 30;
      base.min_offer = draft.min_offer ? Number(draft.min_offer) : null;
    }

    const { error } = await supabase.from("auction_queue" as any).insert(base);
    if (error) return toast.error(error.message);
    setDraft({ title: "", sale_type: "prebid", starting_bid: 1, duration_seconds: 30, snipe_price: "", buy_now_price: "", min_offer: "", quantity: 1, image_url: "", trigger_word: "" });
    setAdding(false);
  }

  async function loadListings() {
    const { data } = await supabase.from("listings").select("id, title, price, image_url")
      .eq("seller_id", hostId).order("created_at", { ascending: false }).limit(40);
    setListings((data as any[] as Listing[]) || []);
    setImporting(true);
  }

  async function importListing(l: Listing) {
    const nextPos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { error } = await supabase.from("auction_queue" as any).insert({
      stream_id: streamId,
      host_id: hostId,
      position: nextPos,
      title: l.title,
      starting_bid: l.price ? Math.max(1, Math.floor(Number(l.price) * 0.5)) : 1,
      duration_seconds: 30,
      snipe_price: l.price,
      quantity: 1,
      image_url: l.image_url,
      scheduled_show_id: scheduledShowId || null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(`Added "${l.title}" from your listings`);
  }

  async function loadVault() {
    setVaultOpen(true);
    setVaultLoading(true);
    const { data } = await supabase
      .from("vault_cards")
      .select("id, name, image_url, estimated_value, tcg_set, tcg_number")
      .eq("user_id", hostId)
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(200);
    setVaultCards((data as any[] as VaultCard[]) || []);
    setVaultLoading(false);
  }

  function toggleVaultPick(id: string) {
    setVaultSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addVaultSelected() {
    if (vaultSelected.size === 0) return toast.error("Pick at least one card");
    setVaultAdding(true);
    const picks = vaultCards.filter((v) => vaultSelected.has(v.id));
    let pos = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const rows = picks.map((v) => {
      const val = Number(v.estimated_value || 0);
      const start = val > 0 ? Math.max(1, Math.floor(val * 0.5)) : 1;
      const title = [v.name, v.tcg_set, v.tcg_number].filter(Boolean).join(" · ");
      return {
        stream_id: streamId,
        host_id: hostId,
        position: pos++,
        title: title || v.name,
        quantity: 1,
        image_url: v.image_url || null,
        sale_type: "prebid" as SaleType,
        starting_bid: start,
        duration_seconds: 30,
        snipe_price: val > 0 ? val : null,
        scheduled_show_id: scheduledShowId || null,
        vault_card_id: v.id,
      };
    });
    const { error } = await supabase.from("auction_queue" as any).insert(rows as any);
    setVaultAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${picks.length} card${picks.length === 1 ? "" : "s"} to Pre-B`);
    setVaultSelected(new Set());
    setVaultOpen(false);
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

  async function togglePrebid(item: QueueItem) {
    await supabase.from("auction_queue" as any).update({ prebid_enabled: !(item.prebid_enabled ?? true) }).eq("id", item.id);
  }

  async function startItem(item: QueueItem) {
    if (!isHost) return;
    if (auctionLive) return toast.error("Finish current round first");
    // Pre-bid rule: if there are pre-bids on this item, the live round starts at
    // the highest pre-bid amount (so existing bidders carry into the live round).
    let effective = { ...item };
    try {
      const { data: top } = await supabase
        .from("prebids" as any)
        .select("amount")
        .eq("queue_item_id", item.id)
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();
      const topAmt = Number((top as any)?.amount || 0);
      if (topAmt > Number(item.starting_bid || 0)) {
        effective = { ...effective, starting_bid: topAmt };
      }
    } catch { /* non-fatal */ }
    await supabase
      .from("auction_queue" as any)
      .update({ status: "running", started_at: new Date().toISOString(), starting_bid: effective.starting_bid })
      .eq("id", item.id);
    await onStart?.(effective);
  }

  async function saveEdit(patch: Partial<QueueItem> & { id: string }): Promise<void> {
    const { id: itemId, ...rest } = patch;
    const { error } = await supabase.from("auction_queue" as any).update(rest as any).eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    toast.success("Item updated");
    setEditing(null);
  }

  async function uploadEditImage(file: File): Promise<string | null> {
    if (!isHost) return null;
    setEditUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${hostId}/queue-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("show-banners").upload(path, file, { upsert: true });
    setEditUploading(false);
    if (error) { toast.error(error.message); return null; }
    const { data } = supabase.storage.from("show-banners").getPublicUrl(path);
    return data.publicUrl;
  }

  async function startByTrigger() {
    const word = triggerInput.trim().toLowerCase();
    if (!word) return;
    const match = items.find((i) => (i.trigger_word || "").toLowerCase() === word && i.status === "queued");
    if (!match) return toast.error(`No queued item with trigger "${word}"`);
    await startItem(match);
    setTriggerInput("");
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

  const queued = items.filter((i) => i.status === "queued" && !i.sold_to);
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

  const saleTypeLabel: Record<SaleType, string> = { prebid: "Pre-Bid", buynow: "Buy Now", either: "Pre-Bid + Buy Now", offer: "Make Offer" };
  const saleTypeChip: Record<SaleType, string> = {
    prebid: "bg-fuchsia-500/30 text-fuchsia-100",
    buynow: "bg-emerald-500/30 text-emerald-100",
    either: "bg-cyan-500/30 text-cyan-100",
    offer: "bg-amber-500/30 text-amber-100",
  };

  return (
    <div className="space-y-2 rounded-xl bg-black/70 p-3 text-white ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/70">
          <ListOrdered className="h-3 w-3" /> Pre-B Queue ({queued.length})
        </p>
        <div className="flex gap-1">
          <button onClick={loadListings} title="Import from your listings"
            className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white">
            <Package className="h-3 w-3" /> Import
          </button>
          <button onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-1 text-[10px] font-bold text-white">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>

      {/* Trigger-word quick start */}
      {queued.some((i) => i.trigger_word) && (
        <div className="flex items-center gap-1.5 rounded-lg bg-white/5 p-1.5">
          <Zap className="h-3 w-3 text-amber-300" />
          <input
            value={triggerInput}
            onChange={(e) => setTriggerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") startByTrigger(); }}
            placeholder="Type trigger word to start matching item"
            className="flex-1 rounded-md bg-white/10 px-2 py-1 text-[11px] placeholder:text-white/40 focus:outline-none"
          />
          <button onClick={startByTrigger} className="rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-black">Go</button>
        </div>
      )}

      {importing && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-white/5 p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase text-white/60">Your listings</p>
            <button onClick={() => setImporting(false)} className="text-[10px] text-white/60">Close</button>
          </div>
          {listings.length === 0 && <p className="text-[10px] text-white/50">No active listings to import.</p>}
          {listings.map((l) => (
            <button key={l.id} onClick={() => importListing(l)}
              className="flex w-full items-center gap-2 rounded-md bg-white/5 p-1.5 text-left hover:bg-white/10">
              {l.image_url
                ? <img src={l.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                : <div className="h-8 w-8 rounded bg-white/10" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">{l.title}</p>
                <p className="text-[9px] text-white/60">{l.price ? `$${Number(l.price).toFixed(0)}` : "—"}</p>
              </div>
              <Plus className="h-3 w-3 text-fuchsia-300" />
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-1.5 rounded-lg bg-white/5 p-2">
          {/* Sale type selector */}
          <div className="flex gap-1">
            {(["prebid", "buynow", "either", "offer"] as SaleType[]).map((s) => (
              <button
                key={s}
                onClick={() => setDraft((d) => ({ ...d, sale_type: s }))}
                className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold ${draft.sale_type === s ? saleTypeChip[s] + " ring-1 ring-white/30" : "bg-white/5 text-white/60"}`}
              >
                {saleTypeLabel[s]}
              </button>
            ))}
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Card / item title"
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-xs placeholder:text-white/40 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            {draft.image_url && <img src={draft.image_url} alt="" className="h-10 w-10 rounded object-cover" />}
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-white/10 px-2 py-1.5 text-[11px] hover:bg-white/15">
              <ImagePlus className="h-3 w-3" />
              {uploading ? "Uploading…" : draft.image_url ? "Replace photo" : "Add photo (optional)"}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const url = await uploadImage(f);
                if (url) setDraft((d) => ({ ...d, image_url: url }));
              }} />
            </label>
          </div>

          {/* Conditional price fields by sale type */}
          {draft.sale_type === "prebid" && (
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
          )}

          {draft.sale_type === "buynow" && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[9px] uppercase text-white/60">Buy Now $
                <input type="number" min={1} value={draft.buy_now_price}
                  onChange={(e) => setDraft((d) => ({ ...d, buy_now_price: e.target.value }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
              <label className="text-[9px] uppercase text-white/60">Qty
                <input type="number" min={1} max={999} value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
            </div>
          )}

          {draft.sale_type === "either" && (
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
              <label className="text-[9px] uppercase text-white/60">Buy Now $
                <input type="number" min={1} value={draft.buy_now_price}
                  onChange={(e) => setDraft((d) => ({ ...d, buy_now_price: e.target.value }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
              <label className="text-[9px] uppercase text-white/60">Qty
                <input type="number" min={1} max={999} value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
            </div>
          )}

          {draft.sale_type === "offer" && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[9px] uppercase text-white/60">Min Offer $
                <input type="number" min={1} placeholder="optional" value={draft.min_offer}
                  onChange={(e) => setDraft((d) => ({ ...d, min_offer: e.target.value }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
              <label className="text-[9px] uppercase text-white/60">Qty
                <input type="number" min={1} max={999} value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) }))}
                  className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs focus:outline-none" />
              </label>
            </div>
          )}

          {/* Trigger word */}
          <label className="block text-[9px] uppercase text-white/60">
            <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-300" /> Trigger word (optional)</span>
            <input
              value={draft.trigger_word}
              onChange={(e) => setDraft((d) => ({ ...d, trigger_word: e.target.value }))}
              placeholder='e.g. "charizard" — say or type to auto-start'
              className="mt-0.5 w-full rounded-md bg-white/10 px-2 py-1 text-xs placeholder:text-white/40 focus:outline-none"
            />
          </label>

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
          Queue is empty. Tap Add or Import to preload items before going live.
        </p>
      )}

      {queued.map((it, i) => {
        const prebidOn = it.prebid_enabled ?? true;
        const st = (it.sale_type || "prebid") as SaleType;
        return (
          <div key={it.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
            {it.image_url
              ? <img src={it.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-white/10 text-[11px] font-extrabold text-amber-300">#{i + 1}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">
                <span className={`mr-1 rounded px-1 text-[8px] font-extrabold uppercase ${saleTypeChip[st]}`}>{saleTypeLabel[st]}</span>
                {it.title}
                {Number(it.quantity || 1) > 1 && <span className="ml-1 rounded bg-fuchsia-500/30 px-1 text-[9px] font-extrabold text-fuchsia-100">×{it.quantity}</span>}
              </p>
              <p className="text-[10px] text-white/60">
                {st === "prebid" && (<>${Number(it.starting_bid).toFixed(0)} · {it.duration_seconds}s{it.snipe_price ? ` · BIN $${Number(it.snipe_price).toFixed(0)}` : ""}</>)}
                {st === "buynow" && (<>Buy Now ${Number(it.buy_now_price ?? it.starting_bid).toFixed(0)}</>)}
                {st === "either" && (<>Pre-Bid ${Number(it.starting_bid).toFixed(0)} · Buy Now ${Number(it.buy_now_price ?? 0).toFixed(0)} · {it.duration_seconds}s</>)}
                {st === "offer" && (<>Make Offer{it.min_offer ? ` · min $${Number(it.min_offer).toFixed(0)}` : ""}</>)}
                {it.trigger_word && <span className="ml-1 rounded bg-amber-500/20 px-1 text-amber-200">⚡ {it.trigger_word}</span>}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setEditing(it)} title="Edit item"
                className="rounded p-1 text-white/80 hover:bg-white/10"><Pencil className="h-3 w-3" /></button>
              {(st === "prebid" || st === "either") && (
                <button onClick={() => togglePrebid(it)}
                  title={prebidOn ? "Pre-bidding ON · tap to disable" : "Pre-bidding OFF · tap to enable"}
                  className={`rounded p-1 ${prebidOn ? "text-fuchsia-300 hover:bg-white/10" : "text-white/40 hover:bg-white/10"}`}>
                  {prebidOn ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              )}
              <button onClick={() => move(it.id, -1)} disabled={i === 0}
                className="rounded p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
              <button onClick={() => move(it.id, 1)} disabled={i === queued.length - 1}
                className="rounded p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
              {(st === "prebid" || st === "either") && (
                <button onClick={() => startItem(it)} disabled={auctionLive}
                  title={auctionLive ? "Finish current round first" : "Start this item"}
                  className="rounded-md bg-emerald-500 p-1.5 text-white disabled:opacity-40"><Play className="h-3 w-3" /></button>
              )}
              <button onClick={() => remove(it.id)} className="rounded p-1 text-white/60 hover:bg-rose-500/30 hover:text-rose-200">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}

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
      {editing && (
        <EditItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          uploadImage={uploadEditImage}
          uploading={editUploading}
        />
      )}
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSave,
  uploadImage,
  uploading,
}: {
  item: QueueItem;
  onClose: () => void;
  onSave: (patch: Partial<QueueItem> & { id: string }) => Promise<void>;
  uploadImage: (file: File) => Promise<string | null>;
  uploading: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [imageUrl, setImageUrl] = useState(item.image_url || "");
  const [saleType, setSaleType] = useState<SaleType>((item.sale_type as SaleType) || "prebid");
  const [startingBid, setStartingBid] = useState(String(item.starting_bid ?? 1));
  const [buyNow, setBuyNow] = useState(String(item.buy_now_price ?? item.snipe_price ?? ""));
  const [duration, setDuration] = useState(String(item.duration_seconds ?? 30));
  const [trigger, setTrigger] = useState(item.trigger_word || "");
  const [quantity, setQuantity] = useState(String(item.quantity ?? 1));

  async function handleSave() {
    if (!title.trim()) return toast.error("Title required");
    const patch: any = {
      id: item.id,
      title: title.trim(),
      image_url: imageUrl || null,
      sale_type: saleType,
      trigger_word: trigger.trim().toLowerCase() || null,
      quantity: Math.max(1, Math.min(999, Number(quantity) || 1)),
      starting_bid: Math.max(1, Number(startingBid) || 1),
      duration_seconds: Math.max(10, Math.min(600, Number(duration) || 30)),
    };
    if (saleType === "buynow" || saleType === "either") {
      const bn = Number(buyNow);
      if (!bn || bn <= 0) return toast.error("Buy Now price required");
      patch.buy_now_price = bn;
      patch.snipe_price = bn;
      if (saleType === "buynow") patch.starting_bid = bn;
    } else {
      patch.buy_now_price = null;
      patch.snipe_price = null;
    }
    await onSave(patch);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl bg-card p-4 text-card-foreground shadow-2xl ring-1 ring-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider">Edit Pre-B Item</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Sale type */}
        <div className="grid grid-cols-3 gap-1">
          {(["prebid", "buynow", "either"] as SaleType[]).map((s) => (
            <button key={s} onClick={() => setSaleType(s)}
              className={`rounded-md px-2 py-2 text-[11px] font-extrabold ${saleType === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s === "prebid" ? "Pre-Bid" : s === "buynow" ? "Buy Now" : "Either / Both"}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Item title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </label>

        <div>
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Image</span>
          <div className="mt-1 flex items-center gap-2">
            {imageUrl
              ? <img src={imageUrl} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-border" />
              : <div className="grid h-14 w-14 place-items-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">No image</div>}
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-muted px-2 py-2 text-xs font-bold hover:bg-muted/70">
              <ImagePlus className="h-3 w-3" />
              {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const url = await uploadImage(f);
                if (url) setImageUrl(url);
              }} />
            </label>
            {imageUrl && (
              <button onClick={() => setImageUrl("")}
                className="rounded-md bg-rose-500/15 px-2 py-2 text-[10px] font-bold text-rose-400">Remove</button>
            )}
          </div>
        </div>

        {(saleType === "prebid" || saleType === "either") && (
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Start $
              <input type="number" min={1} value={startingBid} onChange={(e) => setStartingBid(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-bold focus:outline-none" />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Timer s
              <input type="number" min={10} value={duration} onChange={(e) => setDuration(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-bold focus:outline-none" />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Qty
              <input type="number" min={1} max={999} value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-bold focus:outline-none" />
            </label>
          </div>
        )}

        {(saleType === "buynow" || saleType === "either") && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Buy Now $</span>
            <input type="number" min={1} value={buyNow} onChange={(e) => setBuyNow(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-bold focus:outline-none" />
          </label>
        )}

        <label className="block">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
            <Zap className="h-3 w-3 text-amber-400" /> Voice trigger word (optional)
          </span>
          <input value={trigger} onChange={(e) => setTrigger(e.target.value)} maxLength={32}
            placeholder='e.g. "charizard" — say or type to start this item live'
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-semibold focus:outline-none" />
        </label>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-bold">Cancel</button>
          <button onClick={handleSave} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-extrabold text-primary-foreground">Save</button>
        </div>
      </div>
    </div>
  );
}
