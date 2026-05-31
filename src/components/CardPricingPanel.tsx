import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Sparkles, ShieldCheck, Flag, Lock, Loader2, CheckCircle2 } from "lucide-react";

// Grade tiers we track separate values for.
const TIERS = [
  { key: "raw", label: "Raw" },
  { key: "psa", label: "PSA" },
  { key: "bgs", label: "BGS" },
  { key: "cgc", label: "CGC" },
  { key: "sgc", label: "SGC" },
  { key: "sealed", label: "Sealed" },
] as const;
type TierKey = (typeof TIERS)[number]["key"];
type GradeValues = Partial<Record<TierKey, number>>;

export type PricingCard = {
  id: string;
  name: string;
  category?: string | null;
  tcg_set?: string | null;
  tcg_number?: string | null;
  tcg_year?: string | null;
  estimated_value?: number | null;
  market_price?: number | null;
  price_source?: string | null;
  price_updated_at?: string | null;
  price_confidence?: string | null;
  price_is_ai?: boolean | null;
  price_locked?: boolean | null;
  custom_price?: number | null;
  grade_values?: GradeValues | null;
  is_sealed?: boolean;
};

function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  ai_estimate: "AI estimate",
  manual: "Manual",
  tcg_api: "TCGplayer",
  scryfall: "Scryfall",
  ygoprodeck: "YGOPRODeck",
  tcg_prices: "TCG market",
  tcgdex: "TCGdex",
  pricecharting: "PriceCharting (sold)",
  ebay_sold: "eBay sold",
  psa: "PSA",
};

function confColor(c?: string | null) {
  if (c === "high") return "bg-emerald-500/15 text-emerald-500";
  if (c === "medium") return "bg-amber-500/15 text-amber-500";
  return "bg-red-500/15 text-red-500";
}

export function CardPricingPanel({
  card,
  userId,
  onSaved,
}: {
  card: PricingCard;
  userId: string;
  onSaved: (patch: Partial<PricingCard> & { estimated_value?: number }) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [grades, setGrades] = useState<GradeValues>(card.grade_values || {});
  const [override, setOverride] = useState<string>(card.price_locked && card.custom_price != null ? String(card.custom_price) : "");
  const [savingOverride, setSavingOverride] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportVal, setReportVal] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [aiTier, setAiTier] = useState<TierKey | null>(null);

  const effective = Number(card.price_locked && card.custom_price != null ? card.custom_price : card.estimated_value || 0);
  const sourceLabel = card.price_locked ? "Manual" : SOURCE_LABELS[card.price_source || ""] || card.price_source || "—";
  const isAI = !!card.price_is_ai && !card.price_locked;
  const isSold = /sold|pricecharting|ebay/i.test(card.price_source || "");

  // Refresh from real market data (AI fallback handled server-side, clearly labeled).
  async function refreshPrice() {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("card-price", {
        body: {
          name: card.name,
          set: card.tcg_set || undefined,
          number: card.tcg_number || undefined,
          year: card.tcg_year || undefined,
          category: card.category || undefined,
          skip_cache: true,
        },
      });
      if (error) throw error;
      const market = Number(data?.price?.market) || 0;
      if (!market) {
        toast.error("No market value found — set a manual value below");
        return;
      }
      const patch: Partial<PricingCard> & { estimated_value?: number } = {
        market_price: market,
        price_source: data?.primary_source || null,
        price_confidence: data?.price_confidence || null,
        price_is_ai: !!data?.price_is_ai,
        price_updated_at: new Date().toISOString(),
      };
      // Respect a manual lock; otherwise refresh the headline value + totals.
      if (!card.price_locked) patch.estimated_value = market;
      const { error: upErr } = await supabase.from("vault_cards").update(patch).eq("id", card.id);
      if (upErr) throw upErr;
      onSaved(patch);
      toast.success(data?.price_is_ai ? "Updated with AI estimate" : "Price refreshed");
    } catch (e: any) {
      toast.error(e?.message || "Could not refresh price");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveOverride() {
    setSavingOverride(true);
    try {
      const val = Number(override);
      if (!isFinite(val) || val < 0) {
        toast.error("Enter a valid value");
        return;
      }
      const patch: Partial<PricingCard> & { estimated_value?: number } = {
        custom_price: val,
        price_locked: true,
        price_source: "manual",
        price_is_ai: false,
        price_confidence: "high",
        price_updated_at: new Date().toISOString(),
        estimated_value: val,
      };
      const { error } = await supabase.from("vault_cards").update(patch).eq("id", card.id);
      if (error) throw error;
      onSaved(patch);
      toast.success("Manual value saved");
    } catch (e: any) {
      toast.error(e?.message || "Could not save value");
    } finally {
      setSavingOverride(false);
    }
  }

  async function clearOverride() {
    const patch: Partial<PricingCard> & { estimated_value?: number } = {
      price_locked: false,
      custom_price: null,
    };
    const { error } = await supabase.from("vault_cards").update(patch).eq("id", card.id);
    if (error) { toast.error(error.message); return; }
    setOverride("");
    onSaved(patch);
    toast.success("Using market value");
  }

  async function saveGrades(next: GradeValues) {
    setGrades(next);
    const { error } = await supabase.from("vault_cards").update({ grade_values: next }).eq("id", card.id);
    if (error) { toast.error(error.message); return; }
    onSaved({ grade_values: next });
  }

  async function estimateTier(tier: TierKey) {
    setAiTier(tier);
    try {
      const label = TIERS.find((t) => t.key === tier)?.label || tier;
      const { data, error } = await supabase.functions.invoke("card-price", {
        body: {
          name: tier === "raw" || tier === "sealed" ? card.name : `${card.name} ${label} graded`,
          set: card.tcg_set || undefined,
          number: card.tcg_number || undefined,
          year: card.tcg_year || undefined,
          category: card.category || undefined,
          variant: tier === "sealed" ? "sealed" : tier === "raw" ? undefined : `${label} graded`,
          skip_cache: true,
        },
      });
      if (error) throw error;
      const market = Number(data?.price?.market) || 0;
      if (!market) { toast.error(`No ${label} estimate found`); return; }
      await saveGrades({ ...grades, [tier]: market });
      toast.success(`${label}: $${market.toFixed(2)}`);
    } catch (e: any) {
      toast.error(e?.message || "Estimate failed");
    } finally {
      setAiTier(null);
    }
  }

  async function useTierAsValue(tier: TierKey) {
    const val = Number(grades[tier]) || 0;
    if (!val) return;
    setOverride(String(val));
    const patch: Partial<PricingCard> & { estimated_value?: number } = {
      custom_price: val,
      price_locked: true,
      price_source: "manual",
      price_is_ai: false,
      price_confidence: "high",
      price_updated_at: new Date().toISOString(),
      estimated_value: val,
    };
    const { error } = await supabase.from("vault_cards").update(patch).eq("id", card.id);
    if (error) { toast.error(error.message); return; }
    onSaved(patch);
    toast.success(`Vault value set from ${TIERS.find((t) => t.key === tier)?.label}`);
  }

  async function submitReport() {
    try {
      const { error } = await supabase.from("price_reports").insert({
        vault_card_id: card.id,
        user_id: userId,
        card_name: card.name,
        category: card.category || null,
        shown_value: effective || null,
        suggested_value: reportVal ? Number(reportVal) : null,
        price_source: card.price_source || null,
        reason: reportReason || null,
      });
      if (error) throw error;
      setReported(true);
      setReporting(false);
      toast.success("Thanks — we'll review this price");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit report");
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      {/* Value + source/confidence */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">Market value</p>
          <p className="text-2xl font-bold text-primary">${effective.toFixed(2)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {isAI ? <Sparkles className="h-2.5 w-2.5" /> : isSold ? <ShieldCheck className="h-2.5 w-2.5" /> : null}
              {card.price_locked ? "Your value" : sourceLabel}
            </span>
            {!card.price_locked && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${confColor(card.price_confidence)}`}>
                {card.price_confidence || "low"} confidence
              </span>
            )}
            {isAI && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-500">AI estimate</span>
            )}
            {isSold && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-500">Sold data</span>
            )}
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground">Updated {timeAgo(card.price_updated_at)}</p>
        </div>
        <button
          onClick={refreshPrice}
          disabled={refreshing}
          className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Manual override */}
      <div className="rounded-md bg-muted/60 p-2">
        <div className="flex items-center gap-1">
          <Lock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[9px] uppercase text-muted-foreground">Manual value override</span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="text-xs text-muted-foreground">$</span>
          <input
            type="number" min="0" step="0.01" value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="Set your own value"
            className="w-full rounded-md bg-input px-2 py-1.5 text-xs"
          />
          <button onClick={saveOverride} disabled={savingOverride} className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50">
            {savingOverride ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </button>
        </div>
        {card.price_locked && (
          <button onClick={clearOverride} className="mt-1 text-[9px] text-primary underline">Clear override — use market value</button>
        )}
      </div>

      {/* Per-grade / sealed values */}
      <div className="rounded-md bg-muted/60 p-2">
        <span className="text-[9px] uppercase text-muted-foreground">Values by grade</span>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {TIERS.map((t) => (
            <div key={t.key} className="rounded-md bg-background/40 p-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold">{t.label}</span>
                <button
                  onClick={() => estimateTier(t.key)}
                  disabled={aiTier === t.key}
                  className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-primary disabled:opacity-50"
                >
                  {aiTier === t.key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />} AI
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={grades[t.key] != null ? String(grades[t.key]) : ""}
                  onChange={(e) => setGrades({ ...grades, [t.key]: e.target.value === "" ? undefined : Number(e.target.value) })}
                  onBlur={() => saveGrades(grades)}
                  placeholder="0.00"
                  className="w-full rounded bg-input px-1 py-0.5 text-[11px]"
                />
              </div>
              {Number(grades[t.key]) > 0 && (
                <button onClick={() => useTierAsValue(t.key)} className="mt-0.5 text-[8px] text-primary underline">Use as value</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Report incorrect price */}
      {reported ? (
        <p className="flex items-center justify-center gap-1 text-[10px] text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Price reported — thank you</p>
      ) : reporting ? (
        <div className="space-y-1 rounded-md bg-muted/60 p-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Correct value $</span>
            <input type="number" min="0" step="0.01" value={reportVal} onChange={(e) => setReportVal(e.target.value)} className="w-24 rounded bg-input px-1.5 py-1 text-[11px]" placeholder="optional" />
          </div>
          <input value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="What's wrong? (optional)" className="w-full rounded bg-input px-1.5 py-1 text-[11px]" />
          <div className="flex gap-1">
            <button onClick={submitReport} className="flex-1 rounded-md bg-primary py-1.5 text-[11px] font-bold text-primary-foreground">Submit report</button>
            <button onClick={() => setReporting(false)} className="rounded-md bg-muted px-3 py-1.5 text-[11px]">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setReporting(true)} className="flex w-full items-center justify-center gap-1 rounded-md bg-muted py-1.5 text-[11px] font-semibold text-muted-foreground">
          <Flag className="h-3 w-3" /> Report incorrect price
        </button>
      )}
    </div>
  );
}
