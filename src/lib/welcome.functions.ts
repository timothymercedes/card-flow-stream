import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/** Sends the welcome email once per new account (idempotent per user). */
export const sendWelcomeEmail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as any
    const email = claims?.email as string | undefined
    if (!email) return { sent: false }
    const { data } = await supabase.from('profiles').select('username, created_at').eq('id', userId).maybeSingle()
    if (!data?.created_at || Date.now() - new Date(data.created_at).getTime() > 3 * 86400000) return { sent: false }
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email')
    try {
      const r = await sendTemplateEmail('welcome', email, { templateData: { username: data.username }, idempotencyKey: `welcome-${userId}` })
      return { sent: r.sent }
    } catch (e) {
      console.error('welcome email failed', e)
      return { sent: false }
    }
  })
