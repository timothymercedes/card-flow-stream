import { useEffect, useMemo, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Grader = "PSA" | "BGS" | "CGC" | "TAG";
export const GRADERS: Grader[] = ["PSA", "BGS", "CGC", "TAG"];
export const GRADES = ["10", "9.5", "9", "8.5", "8", "7", "6", "5", "4", "3", "2", "1"];

// Conservative grade multipliers vs raw NM. Used as auto-suggest until we
// wire real PSA/eBay sold-comp APIs (provider registry already supports it).
const GRADER_FACTOR: Record<Grader, number> = { PSA: 1, CGC: 0.92, BGS: 1.05, TAG: 0.85 };
const GRADE_MULT: Record<string, number> = {
  "10": 4.5, "9.5": 2.6, "9": 1.9, "8.5": 1.4, "8": 1.15,
  "7": 0.95, "6": 0.85, "5": 0.75, "4": 0.65, "3": 0.55, "2": 0.45, "1": 0.4,
};

export function suggestGradedPrice(rawNm: number | null | undefined, grader: Grader, grade: string): number {
  const base = Number(rawNm) || 0;
  if (!base) return 0;
  const m = (GRADE_MULT[grade] || 1) * (GRADER_FACTOR[grader] || 1);
  return Math.round(base * m * 100) / 100;
}

type GradedFields = {
  is_graded?: boolean | null;
  grader?: string | null;
  grade?: string | null;
  grading_cert?: string | null;
  graded_price?: number | null;
};

type Props = {
  /** Vault card id. If omitted, panel runs in "uncontrolled" mode (no DB write). */
  cardId?: string;
  /** Raw NM market price used to auto-suggest the graded value. */
  rawMarketPrice?: number | null;
  initial?: GradedFields;
  /** Called after a successful save. */
  onSaved?: (patch: GradedFields & { estimated_value?: number }) => void;
  /** Compact = inline (scanner). Full = vault detail. */
  variant?: "compact" | "full";
};

export function GradedCardPanel({ cardId, rawMarketPrice, initial, onSaved, variant = "full" }: Props) {
  const [tab, setTab] = useState<"raw" | "graded">(initial?.is_graded ? "graded" : "raw");
  const [grader, setGrader] = useState<Grader>((initial?.grader as Grader) || "PSA");
  const [grade, setGrade] = useState<string>(initial?.grade || "10");
  const [cert, setCert] = useState<string>(initial?.grading_cert || "");
  const [price, setPrice] = useState<string>(initial?.graded_price != null ? String(initial.graded_price) : "");
  const [overridden, setOverridden] = useState<boolean>(initial?.graded_price != null && rawMarketPrice
    ? Math.abs(Number(initial.graded_price) - suggestGradedPrice(rawMarketPrice, (initial.grader as Grader) || "PSA", initial.grade || "10")) > 0.01
    : false);
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(() => suggestGradedPrice(rawMarketPrice, grader, grade), [rawMarketPrice, grader, grade]);

  // Recompute suggested into the input unless the user has overridden it.
  useEffect(() => {
    if (!overridden) setPrice(suggested ? String(suggested) : "");
  }, [suggested, overridden]);

  async function save() {
    if (!cardId) {
      onSaved?.({
        is_graded: tab === "graded",
        grader: tab === "graded" ? grader : null,
        grade: tab === "graded" ? grade : null,
        grading_cert: tab === "graded" ? (cert || null) : null,
        graded_price: tab === "graded" ? (Number(price) || null) : null,
        estimated_value: tab === "graded" ? (Number(price) || 0) : (Number(rawMarketPrice) || 0),
      });
      return;
    }
    setSaving(true);
    try {
      const isGraded = tab === "graded";
      const finalPrice = isGraded ? (Number(price) || suggested || 0) : 0;
      const patch: any = {
        is_graded: isGraded,
        grader: isGraded ? grader : null,
        grade: isGraded ? grade : null,
        grading_cert: isGraded ? (cert || null) : null,
        graded_price: isGraded ? finalPrice : null,
      };
      // When graded, override estimated_value with the graded price so vault totals reflect it.
      if (isGraded && finalPrice > 0) (patch as any).estimated_value = finalPrice;
      const { error } = await supabase.from("vault_cards").update(patch).eq("id", cardId);
      if (error) throw error;
      toast.success(isGraded ? `Saved ${grader} ${grade}` : "Switched to raw");
      onSaved?.(patch);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save grading");
    } finally {
      setSaving(false);
    }
  }

  const compact = variant === "compact";

  return (
    <div className={`rounded-lg bg-muted/40 ${compact ? "p-2" : "p-3"} space-y-2`}>
      <div className="flex items-center gap-2">
        <Award className="h-3.5 w-3.5 text-primary" />
        <p className="text-[9px] uppercase text-muted-foreground">Card type</p>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setTab("raw")}
          className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${tab === "raw" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Raw
        </button>
        <button
          type="button"
          onClick={() => setTab("graded")}
          className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${tab === "graded" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Graded
        </button>
      </div>

      {tab === "graded" && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] uppercase text-muted-foreground">Grader</span>
              <select value={grader} onChange={(e) => setGrader(e.target.value as Grader)} className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs">
                {GRADERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] uppercase text-muted-foreground">Grade</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs">
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[9px] uppercase text-muted-foreground">Cert # (optional)</span>
            <input value={cert} onChange={(e) => setCert(e.target.value)} placeholder="e.g. 12345678" className="mt-1 w-full rounded-md bg-input px-2 py-1.5 text-xs" />
          </label>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase text-muted-foreground">Graded price</span>
              {suggested > 0 && (
                <button type="button" onClick={() => { setPrice(String(suggested)); setOverridden(false); }}
                  className="text-[9px] text-primary underline">
                  Use suggested ${suggested.toFixed(2)}
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number" min="0" step="0.01" value={price}
                onChange={(e) => { setPrice(e.target.value); setOverridden(true); }}
                className="w-full rounded-md bg-input px-2 py-1.5 text-xs"
                placeholder={suggested ? suggested.toFixed(2) : "0.00"}
              />
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">
              {overridden ? "Custom price (your value)" : `Auto-suggested from raw NM ($${Number(rawMarketPrice || 0).toFixed(2)}) × ${grader} ${grade} multiplier`}
            </p>
          </div>
        </div>
      )}

      <button
        type="button" onClick={save} disabled={saving}
        className="flex w-full items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {tab === "graded" ? "Save grading" : "Save as raw"}
      </button>
    </div>
  );
}
