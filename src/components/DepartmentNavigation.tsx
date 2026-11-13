import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SHOPPING_DEPARTMENTS } from '@/lib/categoryShoppingConfig';
import { Button } from '@/components/ui/button';

export function DepartmentNavigation({ selected }: { selected?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  return <section aria-label="Shop by category" className="min-w-0 border-b border-border/60 px-4 py-3 lg:px-8">
    <div className="mb-1 flex items-center justify-between">
      <h2 className="text-xs font-semibold text-muted-foreground">Shop by category</h2>
      <div className="hidden gap-1 md:flex">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous categories" title="Previous categories" onClick={() => rail.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft className="h-4 w-4"/></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More categories" title="More categories" onClick={() => rail.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight className="h-4 w-4"/></Button>
      </div>
    </div>
    <nav ref={rail} aria-label="Shopping departments" className="flex min-w-0 gap-1 overflow-x-auto pb-1">
      <Link to="/market" className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">All</Link>
      {SHOPPING_DEPARTMENTS.map(d => <Link key={d.value} to="/marketplace/$department" params={{ department: d.slug }} search={{}} aria-current={selected === d.value ? 'page' : undefined} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors ${selected === d.value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><span aria-hidden>{d.emoji}</span>{d.label}</Link>)}
    </nav>
  </section>;
}