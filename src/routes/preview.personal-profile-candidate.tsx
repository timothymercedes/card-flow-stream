import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { PersonalProfileCandidate } from '@/components/PersonalProfileCandidate';
import { personalPreviewEnabled } from '@/lib/personalProfilePreview';

export const Route = createFileRoute('/preview/personal-profile-candidate')({
  validateSearch: (search: Record<string, unknown>) => ({ username: typeof search.username === 'string' ? search.username : undefined }),
  component: CandidatePage,
  head: () => ({ meta: [
    { title: 'Personal Profile Release Candidate — PullBid Live' },
    { name: 'description', content: 'Isolated real-account personal profile review. Not released.' },
    { name: 'robots', content: 'noindex, nofollow' },
    { property: 'og:title', content: 'Personal Profile Release Candidate — PullBid Live' },
    { property: 'og:description', content: 'Isolated personal profile implementation awaiting approval.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ], links: [{ rel:'stylesheet', href:'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap' }] }),
});
function CandidatePage() {
  const { username } = Route.useSearch();
  const [allowed,setAllowed] = useState(false);
  useEffect(() => setAllowed(personalPreviewEnabled(import.meta.env.DEV,window.location.hostname)),[]);
  return allowed ? <PersonalProfileCandidate key={username ?? 'owner'} username={username} /> : <p className="p-10">Unreleased preview only.</p>;
}