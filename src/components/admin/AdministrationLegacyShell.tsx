import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { AdministrationBrand, AdministrationFavicon } from './AdministrationBrand';

export function AdministrationLegacyShell({ children }: { children: ReactNode }) {
  return <div className="administration-theme min-h-dvh bg-background text-foreground">
    <AdministrationFavicon />
    <header className="administration-sidebar flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-8">
      <AdministrationBrand />
      <div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-muted-foreground">Authorized Personnel Only</span><Button asChild variant="outline"><Link to="/admin-control"><Home className="h-4 w-4" />Overview</Link></Button><Button asChild variant="ghost"><Link to="/"><ArrowLeft className="h-4 w-4" />Public website</Link></Button></div>
    </header>
    <main id="main-content" className="mx-auto min-w-0 max-w-7xl pb-8">{children}</main>
  </div>;
}