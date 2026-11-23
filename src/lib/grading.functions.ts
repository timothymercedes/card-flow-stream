import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CERT_GRADERS } from './grading';
import { lookupCertificate } from './gradingProvider';
export const certificateSchema = z.object({ grader: z.enum(CERT_GRADERS), cert: z.string().trim().regex(/^\d{4,20}$/) });
export const verifyCertificate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => certificateSchema.parse(input))
  .handler(async ({ data }) => {
    const psaToken = process.env['PSA_API_TOKEN'];
    // Partner consent and a credential are both required before calling a paid service.
    const gemrateKey = process.env['GRADING_GEMRATE_APPROVED'] === 'true' ? process.env['GEMRATE_API_KEY'] : undefined;
    return lookupCertificate(data, { ...(psaToken ? { psaToken } : {}), ...(gemrateKey ? { gemrateKey } : {}) });
  });