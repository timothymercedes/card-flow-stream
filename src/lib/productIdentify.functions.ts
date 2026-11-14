import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { sanitizeSuggestion, type ProductSuggestion } from './productIdentify';

const input = z.object({ images: z.array(z.string().url().max(2000)).min(1).max(4), department: z.string().max(40), hint: z.string().max(300).optional() });

const PROMPT = `You identify second-hand merchandise for a marketplace listing. Look at the photos and return JSON only:
{"matches":[{"name","brand","category","subcategory","model","specs":{key:value},"confidence":0-1}],"title","description","tags":[]}
Give up to 4 possible matches, most likely first, with honest confidence. Only describe what is visible or standard catalog facts for that model.
NEVER claim authenticity, grading, serial numbers, condition guarantees, mileage, ownership, accident or title history. If unsure, lower confidence.
The description is a neutral draft the seller will rewrite.`;

export const identifyProduct = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<ProductSuggestion & { error?: string }> => {
    const { generateChatCompletion, GatewayError } = await import('@lovable.dev/ai-gateway');
    try {
      const res = await generateChatCompletion({
        model: 'openai/gpt-6-astra',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: [
            { type: 'text', text: `Department: ${data.department}.${data.hint ? ` Seller note: ${data.hint}` : ''}` },
            ...data.images.map(url => ({ type: 'image_url' as const, image_url: { url } })),
          ] },
        ],
      });
      const text = res.choices?.[0]?.message?.content;
      return sanitizeSuggestion(JSON.parse(typeof text === 'string' ? text : '{}'));
    } catch (e) {
      console.error('identifyProduct failed', e instanceof GatewayError ? e.code : e);
      return { ...sanitizeSuggestion({}), error: 'AI identification is unavailable right now — enter details manually.' };
    }
  });
