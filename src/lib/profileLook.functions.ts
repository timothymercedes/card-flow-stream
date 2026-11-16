import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/** Public-safe look settings (store logo, cover position, layout) for any account. */
export const getProfileLook = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: p } = await supabaseAdmin.from('profiles').select('store_logo_url,profile_cover_position,profile_layout').eq('id', data.userId).maybeSingle();
    return { store_logo_url: p?.store_logo_url ?? null, cover_position: p?.profile_cover_position ?? 50, layout: (p?.profile_layout ?? 'classic') as 'classic' | 'centered' | 'compact' };
  });
