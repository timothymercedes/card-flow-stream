import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canEnterAdministration } from './administration';

export const readAdministration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data, error } = await db.from('user_roles').select('role').eq('user_id', context.userId);
    const roles = (data ?? []).map(row => row.role);
    if (error || !canEnterAdministration(roles)) throw new Error('Administration access required.');
    // All reads run as the caller. No privileged client, new grants, mutations or credentials.
    const [members, stores, listings, broadcasts, reports, legacyReports, alerts] = await Promise.all([
      db.rpc('admin_get_signup_stats'),
      db.from('bazaar_stores').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('listings').select('id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString()).eq('sold', false),
      db.from('live_streams').select('id', { count: 'exact', head: true }).eq('status', 'live').eq('is_demo', false).eq('is_private', false),
      db.from('moderation_reports').select('id,status,severity').in('status', ['open', 'investigating', 'escalated']).limit(1000),
      db.from('user_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
      db.from('notifications').select('id,body,type,created_at,read').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(20),
    ]);
    const memberRow = Array.isArray(members.data) ? members.data[0] : null;
    return {
      roles, refreshedAt: new Date().toISOString(),
      metrics: {
        members: members.error ? null : memberRow?.total ?? null,
        stores: stores.error ? null : stores.count,
        listings: listings.error ? null : listings.count,
        broadcasts: broadcasts.error ? null : broadcasts.count,
      },
      attention: reports.error ? null : {
        unresolved: reports.data.length, critical: reports.data.filter(row => row.severity === 'critical').length,
        escalated: reports.data.filter(row => row.status === 'escalated').length,
        bounded: reports.data.length === 1000,
      },
      legacyReports: legacyReports.error ? null : legacyReports.count,
      alerts: alerts.error ? null : alerts.data,
    };
  });