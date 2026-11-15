import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DepartmentPhoto } from '@/components/DepartmentPhoto';
import { orderedDepartments } from '@/lib/departmentInterests';
import { departmentDisplayLabel } from '@/lib/departmentPhotography';
import { useAuth } from '@/hooks/useAuth';

export function DepartmentNavigation({ selected }: { selected?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const {profile} = useAuth();
  return <section aria-label="Shop by category" className="min-w-0 border-b border-border/60 px-4 py-3 lg:px-8">
    <div className="mb-1 flex items-center justify-between">
      <h2 className="text-sm font-semibold">Shop by category</h2>
      <div className="hidden gap-1 md:flex">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous categories" title="Previous categories" onClick={() => rail.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft className="h-4 w-4"/></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More categories" title="More categories" onClick={() => rail.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight className="h-4 w-4"/></Button>
      </div>
    </div>
    <nav ref={rail} aria-label="Shopping departments" className="flex min-w-0 gap-3 overflow-x-auto py-2">
      {orderedDepartments(profile?.interests).map(d => <Link key={d.value} to="/marketplace/$department" params={{ department: d.slug }} search={{}} aria-current={selected === d.value ? 'page' : undefined} className={`group w-36 shrink-0 overflow-hidden rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44 ${selected === d.value ? 'border-primary text-primary' : 'border-border text-foreground'}`}><div className="aspect-[16/10] overflow-hidden"><DepartmentPhoto value={d.value} className="h-full w-full motion-safe:transition-transform motion-safe:group-hover:scale-105"/></div><span className="block min-h-14 p-3 text-xs font-semibold">{departmentDisplayLabel(d)}</span></Link>)}
      <Link to="/market" className="flex w-28 shrink-0 items-center justify-center rounded-lg border border-border p-3 text-center text-sm font-semibold text-primary">All departments</Link>
    </nav>
  </section>;
}