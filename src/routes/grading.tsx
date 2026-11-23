import { createFileRoute, Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { CertificateVerification } from '@/components/CertificateVerification';
export const Route = createFileRoute('/grading')({
  head: () => ({ meta: [
    { title: 'Grading Verification — PullBid Live' },
    { name: 'description', content: 'Check PSA, CGC, Beckett and SGC card certificates on PullBid Live.' },
    { property: 'og:title', content: 'Grading Verification — PullBid Live' },
    { property: 'og:description', content: 'Check card grading certificates with confirmed provider records.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: Grading,
});
function Grading() {
  return <AppShell><main className="mx-auto max-w-xl space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">Grading Verification</h1><CertificateVerification /><Link to="/vault" className="text-sm text-primary underline">Back to Vault</Link></main></AppShell>;
}