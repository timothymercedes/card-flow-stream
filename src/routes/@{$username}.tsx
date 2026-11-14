import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { PersonalProfileCandidate } from '@/components/PersonalProfileCandidate';

// Public personal profile URL: /@username. Owner sees and manages their own profile;
// everyone else goes through the server-side visitor gate (currently closed).
export const Route = createFileRoute('/@{$username}')({
  component: PersonalProfilePage,
  head: ({ params }) => ({ meta: [
    { title: `@${params.username} — PullBid Live` },
    { name: 'description', content: `Personal collector profile of @${params.username} on PullBid Live.` },
    { name: 'robots', content: 'noindex, nofollow' },
    { property: 'og:title', content: `@${params.username} — PullBid Live` },
    { property: 'og:description', content: 'Collector stories on PullBid Live.' },
    { property: 'og:type', content: 'profile' }, { name: 'twitter:card', content: 'summary' },
  ], links: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap' }] }),
});
function PersonalProfilePage() {
  const { username } = Route.useParams();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <PersonalProfileCandidate key={username} username={username.toLowerCase()} /> : null;
}
