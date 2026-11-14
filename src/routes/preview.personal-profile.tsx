import { createFileRoute, redirect } from '@tanstack/react-router';

// The demonstration profile is retired; this old link now opens the real personal profile.
export const Route = createFileRoute('/preview/personal-profile')({
  validateSearch: (search: Record<string, unknown>): { view?: string } => ({ view: typeof search.view === 'string' ? search.view : undefined }),
  beforeLoad: () => { throw redirect({ to: '/preview/personal-profile-candidate', search: { username: undefined } }); },
});
