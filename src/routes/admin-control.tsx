import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { useState } from 'react';
import { Home, Users, ShieldCheck, Radio, Flag, Store, Wallet, Bell, Settings, ScrollText, Menu, ArrowLeft, ArrowUpRight, RefreshCw, LockKeyhole, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdministrationBrand, AdministrationFavicon } from '@/components/admin/AdministrationBrand';
import { useAuth } from '@/hooks/useAuth';
import { readAdministration } from '@/lib/administration.functions';
import { administrationSection } from '@/lib/administration';
import { AdministrationSignOut } from '@/components/admin/AdministrationSignOut';

const sections = [
  ['overview', 'Overview', Home], ['members', 'Members', Users], ['administrators', 'Administrators', ShieldCheck],
  ['live', 'Live Control', Radio], ['reports', 'Reports & Disputes', Flag], ['stores', 'Stores', Store],
  ['finance', 'Finance', Wallet], ['notifications', 'Notifications', Bell], ['settings', 'System Settings', Settings], ['audit', 'Audit Logs', ScrollText],
] as const;

export const Route = createFileRoute('/admin-control')({
  validateSearch: zodValidator(z.object({ section: z.string().optional() })),
  head: () => ({ meta: [
    { title: 'Control Center — PullBid Live Administration' },
    { name: 'description', content: 'Authorized PullBid Live administration overview and operational tools.' },
    { property: 'og:title', content: 'PullBid Live Administration — Control Center' },
    { property: 'og:description', content: 'Authorized personnel administration portal.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: AdministrationPortal,
});

function AdministrationPortal() {
  const { user, loading } = useAuth();
  const section = administrationSection(Route.useSearch().section);
  const [menuOpen, setMenuOpen] = useState(false);
  const read = useServerFn(readAdministration);
  const query = useQuery({ queryKey: ['administration-preview', user?.id], queryFn: () => read(), enabled: !!user && !loading, retry: false, staleTime: 0 });
  const title = sections.find(item => item[0] === section)?.[1] ?? 'Overview';
  const navigation = <>
    <AdministrationBrand />
    <p className="my-5 border-b border-border pb-5 text-xs text-muted-foreground">Authorized Personnel Only</p>
    <nav aria-label="Administration sections" className="space-y-1">
      {sections.filter(item => item[0] !== 'administrators' || query.data?.roles.includes('owner')).map(([key, label, Icon]) => <Button key={key} asChild variant="ghost" className={`w-full justify-start ${section === key ? 'bg-accent text-accent-foreground' : ''}`}>
        <Link to="/admin-control" search={{ section: key }} onClick={() => setMenuOpen(false)} aria-current={section === key ? 'page' : undefined}><Icon className="h-4 w-4" />{label}</Link>
      </Button>)}
    </nav>
    <div className="mt-8 border-t border-border pt-4"><p className="mb-3 text-xs text-muted-foreground">{query.data?.roles.includes('owner') ? 'Owner & Founder' : 'Platform administrator'}</p><Button asChild variant="outline" className="w-full"><Link to="/"><ArrowLeft className="h-4 w-4" />Public website</Link></Button><AdministrationSignOut /></div>
  </>;
  if (loading || (!!user && query.isPending)) return <div className="administration-theme grid min-h-dvh place-content-center bg-background p-6"><AdministrationFavicon /><AdministrationBrand large /><p className="mt-6 text-center text-muted-foreground" role="status">Checking administration access…</p></div>;
  if (!user || query.isError) return <div className="administration-theme grid min-h-dvh place-content-center bg-background p-6"><AdministrationFavicon /><AdministrationBrand large /><h1 className="mt-8 text-center text-xl font-semibold">Authorized Personnel Only</h1><p className="my-4 max-w-sm text-center text-sm text-muted-foreground">{user ? 'Administration access could not be verified. Existing owner or administrator access is required.' : 'Sign in to access the administration control center.'}</p><div className="flex justify-center gap-3"><Button asChild><Link to="/admin-login">Administration sign in</Link></Button>{user && <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button>}</div>{user && <div className="mt-3 flex justify-center"><AdministrationSignOut /></div>}<Button asChild variant="link" className="mt-3"><Link to="/">Public website</Link></Button></div>;
  const data = query.data;
  if (!data) return null;
  return <div className="administration-theme min-h-dvh bg-background text-foreground">
    <AdministrationFavicon />
    <aside className="administration-sidebar fixed inset-y-0 left-0 hidden w-64 overflow-y-auto border-r border-border p-6 lg:block">{navigation}</aside>
    <div className="min-w-0 lg:ml-64">
      <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><Button variant="outline" size="icon" className="lg:hidden" aria-label="Open administration menu" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></Button><span className="hidden text-sm text-muted-foreground sm:block">Administration / {title}</span><div className="sm:hidden"><AdministrationBrand /></div></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" aria-label="Refresh administration data" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" /></Button><Button asChild variant="outline" size="icon"><Link to="/admin-control" search={{ section: 'notifications' }} aria-label="Administration notifications"><Bell className="h-4 w-4" /></Link></Button></div>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetContent side="left" className="administration-theme administration-sidebar w-80 max-w-[90vw] overflow-y-auto"><SheetHeader><SheetTitle className="sr-only">Administration navigation</SheetTitle></SheetHeader>{navigation}</SheetContent></Sheet>
      <main id="main-content" className="mx-auto max-w-6xl p-4 sm:p-8">
        {section !== 'overview' && <Button asChild variant="link" className="mb-4 px-0"><Link to="/admin-control" search={{ section: 'overview' }}><ArrowLeft className="h-4 w-4" />Back to Overview</Link></Button>}
        <div className="mb-8"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-2 text-xs text-muted-foreground">Read-only preview · Updated {new Date(data.refreshedAt).toLocaleTimeString()}</p></div>
        {section === 'overview' ? <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{([
            ['Member profiles', data.metrics.members, Users], ['Active Bazaar stores', data.metrics.stores, Store],
            ['Public unexpired listings', data.metrics.listings, ShoppingIcon], ['Non-demo live-status shows', data.metrics.broadcasts, Radio],
          ] as const).map(([label, count, Icon]) => <div key={label} className="min-w-0 rounded-md border border-border bg-card p-4"><Icon className="mb-4 h-5 w-5 text-primary" /><p className="min-h-10 text-sm font-medium">{label}</p><p className="mt-2 text-3xl font-semibold">{count ?? '—'}</p>{count == null && <p className="mt-1 text-xs text-muted-foreground">Unavailable</p>}</div>)}</div>
          <section className="mt-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Needs attention</h2><Button asChild variant="link"><Link to="/admin-control" search={{ section: 'reports' }}>Open review queues<ArrowUpRight className="h-4 w-4" /></Link></Button></div>
            <div className="grid gap-3 sm:grid-cols-3">{[['Unresolved moderation reports', data.attention?.unresolved], ['Critical reports', data.attention?.critical], ['Escalated reports', data.attention?.escalated]].map(([label, count]) => <div key={label} className="rounded-md border border-border bg-card p-4"><AlertTriangle className="mb-3 h-5 w-5 text-destructive" /><p className="text-sm">{label}</p><p className="mt-2 text-2xl font-semibold">{count ?? '—'}{data.attention?.bounded ? '+' : ''}</p></div>)}</div>
            <p className="mt-3 text-xs text-muted-foreground">Legacy reports awaiting review: {data.legacyReports ?? 'Unavailable'}. Queues remain separate; duplicate reports are not grouped cases.</p>
          </section><section className="mt-10"><h2 className="mb-4 text-xl font-semibold">Recent account alerts</h2><AlertList alerts={data.alerts?.slice(0, 4) ?? null} /></section>
        </> : section === 'notifications' ? <AlertList alerts={data.alerts} /> : <AdministrationTools section={section} owner={data.roles.includes('owner')} />}
      </main>
    </div>
  </div>;
}

const ShoppingIcon = Store;
function AlertList({ alerts }: { alerts: Awaited<ReturnType<typeof readAdministration>>['alerts'] }) {
  if (!alerts) return <p className="border-y border-border py-8 text-sm text-muted-foreground">Alerts unavailable. Refresh to retry.</p>;
  if (!alerts.length) return <p className="border-y border-border py-8 text-sm text-muted-foreground">No recent account alerts.</p>;
  return <ul className="divide-y divide-border border-y border-border">{alerts.map(alert => <li key={alert.id} className="flex items-start gap-3 py-4"><Bell className="mt-1 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words text-sm">{alert.body}</p><time className="mt-1 block text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</time></div></li>)}</ul>;
}

function AdministrationTools({ section, owner }: { section: string; owner: boolean }) {
  // Existing tools keep their own server checks and URLs; no new action surface is introduced.
  return <div className="space-y-4">
    {section === 'members' && <Tool to="/admin" tab="mod_users" label="Member search and dossiers" />}
    {section === 'administrators' && (owner ? <><Tool to="/admin" tab="roles" label="Existing administrator roles" /><p className="text-sm text-muted-foreground">Permission groups and new portal memberships await separate approval.</p></> : <p>Owner access required.</p>)}
    {section === 'live' && <><Tool to="/admin" tab="users" label="Existing live access controls" /><Tool to="/admin/shipping-health" label="Shipping health" /></>}
    {section === 'reports' && <><Tool to="/admin" tab="reports" label="Legacy report queue" /><Tool to="/admin" tab="mod_reports" label="Moderation report queue" /><Tool to="/admin" tab="mod_disputes" label="Disputes" /><Tool to="/admin" tab="evidence" label="Evidence review" /><p className="text-sm text-muted-foreground">Unified cases, assignments and appeals await permission review.</p></>}
    {section === 'stores' && <><Tool to="/admin" tab="verifications" label="Seller verification" /><Tool to="/admin/bazaar" label="PB Bazaar store review" /><Tool to="/admin/bazaar-suppliers" label="PB Bazaar suppliers" /><p className="text-sm text-muted-foreground">PB Store remains dedicated to trading cards and collectibles. PB Bazaar catalogs remain separate.</p></>}
    {section === 'finance' && <div className="flex items-start gap-3 border-y border-border py-8"><LockKeyhole className="h-5 w-5 shrink-0" /><p className="text-sm text-muted-foreground">Finance actions are not available in this preview portal. Checkout, payments, payouts and supplier ordering retain their separate approval gates.</p></div>}
    {section === 'settings' && <><Tool to="/admin/performance" label="Performance diagnostics" /><p className="text-sm text-muted-foreground">New system configuration and integration controls await separate review.</p></>}
    {section === 'audit' && <><Tool to="/admin" tab="mod_audit" label="Moderation audit history" /><Tool to="/admin" tab="audit" label="Existing administration audit log" /><Tool to="/admin/identity-audit" label="Identity audit" /></>}
  </div>;
}
function Tool({ to, tab, label }: { to: '/admin' | '/admin/shipping-health' | '/admin/bazaar' | '/admin/bazaar-suppliers' | '/admin/performance' | '/admin/identity-audit'; tab?: string; label: string }) {
  return <Button asChild variant="outline" className="h-auto w-full justify-between whitespace-normal py-4 text-left"><Link to={to} search={{ tab }}><span>{label}</span><ArrowUpRight className="h-4 w-4 shrink-0" /></Link></Button>;
}