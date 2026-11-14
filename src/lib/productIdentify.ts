// Pure helpers for AI-assisted general merchandise identification (non-card).
// AI output is only a suggestion: sellers edit everything, and invented facts are stripped.
export type ProductMatch = { name: string; brand: string; category: string; subcategory: string; model: string; specs: Record<string, string>; confidence: number };
export type ProductSuggestion = { matches: ProductMatch[]; title: string; description: string; tags: string[] };

const BANNED_SPEC_KEYS = /authentic|grade|grading|serial|certif|psa|bgs|cgc|mileage|odometer|vin|title_status|accident|ownership/i;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function sanitizeSuggestion(raw: unknown): ProductSuggestion {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const matches = (Array.isArray(r.matches) ? r.matches : []).slice(0, 4).map((m): ProductMatch => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const specs: Record<string, string> = {};
    if (o.specs && typeof o.specs === 'object') for (const [k, v] of Object.entries(o.specs as Record<string, unknown>)) {
      if (!BANNED_SPEC_KEYS.test(k) && str(v)) specs[str(k, 40)] = str(v);
    }
    const c = Number(o.confidence);
    return { name: str(o.name), brand: str(o.brand), category: str(o.category, 60), subcategory: str(o.subcategory, 60), model: str(o.model), specs, confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0 };
  }).filter(m => m.name).sort((a, b) => b.confidence - a.confidence);
  const tags = (Array.isArray(r.tags) ? r.tags : []).map(t => str(t, 40)).filter(Boolean).slice(0, 15);
  return { matches, title: str(r.title, 200), description: str(r.description, 4000), tags };
}

/** Confidence below this is shown as "uncertain" and never auto-applied. */
export const CONFIDENT = 0.75;
export function confidenceLabel(c: number) { return c >= CONFIDENT ? 'Likely match' : c >= 0.4 ? 'Possible match' : 'Uncertain'; }
