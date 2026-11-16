import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const VAULT_ITEM_CATEGORIES = ["Electronics", "Automotive", "Fashion", "Home & Living", "Tools & Equipment", "Sports & Outdoors", "Toys & Games", "Collectibles", "Jewelry & Watches", "Art", "Other"] as const;

export type VaultItemGuess = { name: string; brand: string; category: string; value_low: number | null; value_high: number | null; confidence: number; error?: string };

const PROMPT = `You identify a personal item from one photo for a collector's inventory. Return JSON only:
{"name": string (brand + model, short), "brand": string, "category": one of ${VAULT_ITEM_CATEGORIES.join(', ')}, "value_low": number, "value_high": number, "confidence": 0-1}
value_low/value_high = typical USED resale price range in USD for this exact model today. If you cannot tell the model, give a wide range and low confidence. Never claim authenticity.`;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };

export const identifyVaultItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ image: z.string().startsWith('data:image/').max(3_000_000) }).parse(d))
  .handler(async ({ data }): Promise<VaultItemGuess> => {
    const { generateChatCompletion, GatewayError } = await import('@lovable.dev/ai-gateway');
    try {
      const res = await generateChatCompletion({
        model: 'openai/gpt-6-astra',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: [{ type: 'text', text: 'Identify this item and its resale value.' }, { type: 'image_url', image_url: { url: data.image } }] },
        ],
      });
      const text = res.choices?.[0]?.message?.content;
      const p = JSON.parse(typeof text === 'string' ? text : '{}') as Record<string, unknown>;
      const cat = String(p.category ?? '');
      let low = num(p.value_low), high = num(p.value_high);
      if (low && high && low > high) [low, high] = [high, low];
      return {
        name: String(p.name ?? '').slice(0, 120), brand: String(p.brand ?? '').slice(0, 60),
        category: (VAULT_ITEM_CATEGORIES as readonly string[]).includes(cat) ? cat : 'Other',
        value_low: low, value_high: high, confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
      };
    } catch (e) {
      console.error('identifyVaultItem failed', e instanceof GatewayError ? e.code : e);
      return { name: '', brand: '', category: 'Other', value_low: null, value_high: null, confidence: 0, error: 'Item scan is unavailable right now — enter details manually.' };
    }
  });
