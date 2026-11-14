import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { VaultPrivacyPreview } from '@/components/VaultPrivacyPreview';
import { personalPreviewEnabled } from '@/lib/personalProfilePreview';
export const Route = createFileRoute('/preview/vault-privacy')({
  component: Page,
  head: () => ({ meta: [
    { title: 'Vault Privacy Preview — PullBid Live' },
    { name: 'description', content: 'Review individual card privacy and show-only collectible selections without changing live cards.' },
    { property: 'og:title', content: 'Vault Privacy Preview — PullBid Live' },
    { property: 'og:description', content: 'Preview-only card audiences and show collectible selection.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
});
function Page() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => { setAllowed(personalPreviewEnabled(import.meta.env.DEV, window.location.hostname)); }, []);
  return <AppShell>{allowed ? <VaultPrivacyPreview /> : <p className="p-10 text-center text-muted-foreground">Preview only</p>}</AppShell>;
}