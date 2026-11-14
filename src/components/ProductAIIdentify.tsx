import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { identifyProduct } from '@/lib/productIdentify.functions';
import { confidenceLabel, type ProductMatch, type ProductSuggestion } from '@/lib/productIdentify';
import type { ProductDetails } from '@/lib/marketplaceDepartments';

type Props = { department: string; images: string[]; hint: string; details: ProductDetails;
  onApply: (p: { title?: string; description?: string; details: ProductDetails }) => void };

/** Optional AI suggestions for non-card merchandise. Nothing is applied until the seller chooses. */
export function ProductAIIdentify({ department, images, hint, details, onApply }: Props) {
  const run = useServerFn(identifyProduct);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProductSuggestion | null>(null);
  if (department === 'collectibles') return null;
  const go = async () => {
    if (!images.length) return toast.error('Add a product photo first');
    setBusy(true);
    try {
      const r = await run({ data: { images, department, hint: hint || undefined } });
      if (r.error) toast.error(r.error);
      else if (!r.matches.length) toast.info('No confident match — enter the details yourself.');
      setResult(r);
    } catch { toast.error('AI identification failed — enter details manually.'); }
    finally { setBusy(false); }
  };
  const apply = (m: ProductMatch) => {
    const next: ProductDetails = { ...details, ...m.specs };
    if (m.brand) next.brand = m.brand;
    if (m.model) next.model = m.model;
    if (result?.tags.length) next.tags = result.tags.join(', ');
    onApply({ title: result?.title || m.name, description: result?.description || undefined, details: next });
    toast.success('Suggestion applied — review and edit everything before publishing.');
    setResult(null);
  };
  return <div className="space-y-2 rounded-xl border border-border p-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Optional: let AI suggest product details from your photos. You can edit or skip.</p>
      <button type="button" onClick={go} disabled={busy} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground disabled:opacity-50">{busy ? 'Identifying…' : '✨ Identify with AI'}</button>
    </div>
    {result && result.matches.length > 0 && <div className="space-y-2" aria-label="AI suggestions">
      {result.matches.map((m, i) => <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs">
        <div className="min-w-0"><p className="font-semibold">{m.name}</p><p className="text-muted-foreground">{[m.brand, m.model, m.category].filter(Boolean).join(' · ')}</p><p className="text-[11px] text-muted-foreground">{confidenceLabel(m.confidence)} · {Math.round(m.confidence * 100)}%</p></div>
        <button type="button" onClick={() => apply(m)} className="shrink-0 rounded-md bg-primary px-2 py-1 font-bold text-primary-foreground">Use this</button>
      </div>)}
      <button type="button" onClick={() => setResult(null)} className="text-xs text-muted-foreground underline">None of these — I'll enter it myself</button>
      <p className="text-[11px] text-muted-foreground">AI suggestions are not verified. They never claim authenticity, grading or serial numbers.</p>
    </div>}
  </div>;
}
