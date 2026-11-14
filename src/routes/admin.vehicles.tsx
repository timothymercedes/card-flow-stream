import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { reviewVehicle } from '@/lib/vehicleReview';
import { Car } from 'lucide-react';

export const Route = createFileRoute('/admin/vehicles')({
  head: () => ({ meta: [
    { title: 'Vehicle Listing Review — PullBid Live Admin' },
    { name: 'description', content: 'Review vehicle listings for VIN privacy, odometer disclosure and off-platform risk.' },
    { property: 'og:title', content: 'Vehicle Listing Review — PullBid Live Admin' },
    { property: 'og:description', content: 'Compliance queue for automotive listings.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: VehicleReview,
});

function VehicleReview() {
  const { user } = useAuth();
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const role = useQuery({ queryKey: ['admin-vehicles-role', user?.id], enabled: !!user, queryFn: async () => {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user!.id);
    return (data ?? []).some(r => ['owner', 'admin', 'moderator'].includes(String(r.role)));
  } });
  const list = useQuery({ queryKey: ['admin-vehicles'], enabled: !!role.data, queryFn: async () => {
    const { data, error } = await supabase.from('listings').select('id, title, description, product_details, auction_status, created_at').eq('department', 'automotive').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []).map(l => ({ ...l, flags: reviewVehicle({ ...l, product_details: l.product_details as Record<string, string> }) }));
  } });
  if (!user || role.isLoading) return <AppShell><p className="p-6 text-sm text-muted-foreground">Checking access…</p></AppShell>;
  if (!role.data) return <AppShell><p className="p-6 text-sm">This page is for administrators only.</p></AppShell>;
  const rows = (list.data ?? []).filter(r => !onlyFlagged || r.flags.length);
  return <AppShell><div className="mx-auto max-w-4xl space-y-4 p-4">
    <div className="flex items-center gap-2"><Car className="h-5 w-5 text-primary"/><h1 className="text-xl font-bold">Vehicle listing review</h1></div>
    <p className="text-xs text-muted-foreground">Automatic checks for VIN privacy, mileage and odometer disclosure, title status and off-platform payment risk. Take action from the listing page or the Reports tab.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)}/>Only listings with issues</label>
    {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
    {list.isError && <p role="alert" className="text-sm text-destructive">Couldn't load vehicle listings.</p>}
    {list.data && !rows.length && <p className="text-sm text-muted-foreground">No vehicle listings {onlyFlagged ? 'need attention' : 'yet'}.</p>}
    {rows.map(r => <div key={r.id} className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{r.title}</p><p className="text-xs text-muted-foreground">{r.auction_status} · {new Date(r.created_at).toLocaleDateString()} · VIN shown: {(r.product_details as Record<string,string>)?.vin_masked || 'none'}</p></div>
      <Link to="/market/$id" params={{ id: r.id }} className="shrink-0 text-sm font-semibold text-primary">Open</Link></div>
      {r.flags.length ? <ul className="mt-2 space-y-1">{r.flags.map((f, i) => <li key={i} className={`text-xs ${f.level === 'block' ? 'text-destructive' : 'text-muted-foreground'}`}>{f.level === 'block' ? '⛔' : '⚠️'} {f.text}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">✓ No issues found</p>}
    </div>)}
  </div></AppShell>;
}
