import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { PersonalProfilePreview } from '@/components/PersonalProfilePreview';
import { PERSONAL_PROFILE_PREVIEW_PATH, parsePersonalPreviewView, personalPreviewEnabled, type PersonalPreviewView } from '@/lib/personalProfilePreview';

export const Route = createFileRoute('/preview/personal-profile')({
  validateSearch: (search: Record<string, unknown>): { view?: PersonalPreviewView } => ({ view: parsePersonalPreviewView(search.view) }),
  component: PersonalProfilePreviewPage,
  head: () => ({
    meta: [
      { title: 'Personal Profile Preview — PullBid Live' },
      { name: 'description', content: 'Preview-only personal profile design for PullBid Live.' },
      { name: 'robots', content: 'noindex, nofollow' },
      { property: 'og:title', content: 'Personal Profile Preview — PullBid Live' },
      { property: 'og:description', content: 'Preview-only personal profile design.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap' }],
  }),
});

function PersonalProfilePreviewPage() {
  const { view } = Route.useSearch();
  const [allowed, setAllowed] = useState<boolean | null>(import.meta.env.DEV ? true : null);
  useEffect(() => { setAllowed(personalPreviewEnabled(import.meta.env.DEV, window.location.hostname)); }, []);
  if (allowed === null) return <AppShell><p className="p-10 text-center text-muted-foreground">Opening preview…</p></AppShell>;
  if (!allowed) return <AppShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold">Preview only</h1><p className="mt-2 text-sm text-muted-foreground">This design is available only in the editor preview.</p><Button asChild className="mt-6"><Link to="/profile">Go to your profile</Link></Button></div></AppShell>;
  const account = <AppShell><div className="mx-auto max-w-md p-10 text-center"><p className="text-sm text-muted-foreground">Your existing account and security settings stay on your profile page.</p><Button asChild className="mt-6"><Link to="/profile">Open account settings</Link></Button></div></AppShell>;
  return <PersonalProfilePreview key={view ?? 'owner'} account={account} initialVisitor={view === 'visitor'} routeLabel={`${PERSONAL_PROFILE_PREVIEW_PATH}${view === 'visitor' ? '?view=visitor' : ''}`} />;
}
