import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canEndLiveSession, disableBroadcast, endedSessionPatch } from './liveTermination';

export const endLiveSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ streamId: z.string().uuid(), reason: z.string().trim().min(3).max(300).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error: rolesError } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (rolesError) throw new Error('Could not check stream permissions.');
    const roleNames = (roles ?? []).map(role => role.role);
    const staff = roleNames.some(role => role === 'owner' || role === 'admin');
    // Privileged client is loaded only after verifying the existing staff role.
    const db = staff ? (await import('@/integrations/supabase/client.server')).supabaseAdmin : context.supabase;
    const { data: stream, error } = await db.from('live_streams').select('id,seller_id,status,mode,ends_at,ended_at').eq('id', data.streamId).maybeSingle();
    if (error || !stream || !canEndLiveSession(stream.seller_id, context.userId, roleNames)) throw new Error('Stream not found or permission denied.');
    if (staff && stream.seller_id !== context.userId && !data.reason) throw new Error('A reason is required to end another member’s stream.');
    const { data: credentials, error: credError } = await db.from('live_stream_credentials').select('cf_live_input_id').eq('stream_id', stream.id).maybeSingle();
    if (credError) throw new Error('Could not check the broadcast connection.');
    if (credentials?.cf_live_input_id) {
      const account = process.env['CLOUDFLARE_ACCOUNT_ID'];
      const token = process.env['CLOUDFLARE_STREAM_API_TOKEN'];
      if (!account || !token) throw new Error('Broadcast shutdown is not configured.');
      await disableBroadcast(account, token, credentials.cf_live_input_id);
    }
    if (stream.status === 'ended') return { ended: true };
    // Preserve the existing auction settlement engine. Flex never invokes it.
    if (stream.mode !== 'show_off' && stream.ends_at) {
      const { error: finalError } = await context.supabase.rpc('finalize_auction_round', { _stream_id: stream.id });
      if (finalError) throw new Error('Broadcast stopped, but the auction could not be finalized. Retry ending the stream.');
    }
    const patch = endedSessionPatch(new Date().toISOString());
    const { data: updated, error: updateError } = await db.from('live_streams').update(patch).eq('id', stream.id).neq('status', 'ended').select('id');
    if (updateError) throw new Error('Broadcast stopped, but the session could not close. Retry ending the stream.');
    if (updated?.length && staff && stream.seller_id !== context.userId) {
      const { error: logError } = await (db.from('admin_action_log') as any).insert({ admin_id: context.userId, action: 'stream.ended', target_table: 'live_streams', target_id: stream.id, subject_user_id: stream.seller_id, before_state: { status: stream.status }, after_state: patch, reason: data.reason });
      if (logError) console.error('Stream-end audit could not be saved', logError.code);
    }
    return { ended: true };
  });

export const listActiveFlexSessions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId).in('role', ['owner', 'admin']);
    if (!roles?.length) throw new Error('Admins only.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.from('live_streams').select('id,title,status,seller_id').eq('mode', 'show_off').in('status', ['live', 'paused']).limit(100);
    if (error) throw new Error('Could not load Flex sessions.');
    return data ?? [];
  });