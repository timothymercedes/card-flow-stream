import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { AdministrationBrand, AdministrationFavicon } from '@/components/admin/AdministrationBrand';
import { useAuth } from '@/hooks/useAuth';
import { LockKeyhole, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/admin-login')({
  head: () => ({ meta: [
    { title: 'Personnel Sign In — PullBid Live Administration' },
    { name: 'description', content: 'Authorized personnel sign-in for PullBid Live Administration.' },
    { property: 'og:title', content: 'PullBid Live Administration — Personnel Sign In' },
    { property: 'og:description', content: 'Secure access for authorized PullBid Live personnel.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' },
  ] }), component: AdministrationLogin,
});
function AdministrationLogin() {
  const { user } = useAuth();
  return <main id="main-content" className="administration-theme administration-login flex min-h-dvh items-center justify-center p-6">
    <AdministrationFavicon />
    <div className="w-full max-w-sm"><AdministrationBrand large /><div className="my-8 border-y border-border py-5 text-center"><LockKeyhole className="mx-auto mb-3 h-5 w-5 text-primary" /><h1 className="text-xl font-semibold">Authorized Personnel Only</h1><p className="mt-3 text-sm text-muted-foreground">Owner & Admin Control Center</p></div>
      <Button asChild className="h-12 w-full">{user ? <Link to="/admin-control">Continue to control center</Link> : <Link to="/auth" search={{ returnTo: '/admin-control', mode: 'signin' }}>Sign in securely</Link>}</Button>
      <Button asChild variant="link" className="mt-4 w-full"><Link to="/"><ArrowLeft className="h-4 w-4" />Public website</Link></Button>
    </div>
  </main>;
}