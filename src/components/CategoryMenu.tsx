import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Grid2X2, Search, ShoppingBag, Store } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DepartmentPhoto } from '@/components/DepartmentPhoto';
import { orderedDepartments } from '@/lib/departmentInterests';
import { departmentDisplayLabel } from '@/lib/departmentPhotography';
import { useAuth } from '@/hooks/useAuth';
import logo from '@/assets/logo.png';

export function CategoryMenu({className = ''}: {className?: string}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const {profile} = useAuth();
  const departments = orderedDepartments(profile?.interests);
  const term = query.trim().toLowerCase();
  const matches = departments.filter(d => `${departmentDisplayLabel(d)} ${d.description} ${d.subcategories.map(s => s.label).join(' ')}`.toLowerCase().includes(term));
  const signature = matches.find(d => d.value === 'collectibles');
  function close() {setOpen(false);}
  return <Dialog open={open} onOpenChange={value => {setOpen(value); if (!value) setQuery('');}}>
    <DialogTrigger asChild><Button variant="ghost" className={`h-10 shrink-0 text-primary ${className}`}><Grid2X2 aria-hidden/>Categories</Button></DialogTrigger>
    <DialogContent className="category-menu flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 motion-reduce:animate-none">
      <div className="shrink-0 border-b border-border px-4 pb-4 pt-5 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-center gap-2 pr-10"><img src={logo} alt="" width={32} height={32}/><span className="text-sm font-bold">PULL<span className="text-primary">BID</span> <span className="text-live">LIVE</span></span></div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><DialogTitle className="text-2xl font-bold sm:text-3xl">Categories</DialogTitle><DialogDescription className="mt-1">Find your next great discovery</DialogDescription></div>
            <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden/><input aria-label="Search departments" placeholder="Search departments…" value={query} onChange={e => setQuery(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-muted pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7">
          {signature && <Link onClick={close} to="/marketplace/$department" params={{department:signature.slug}} search={{}} className="group relative mb-6 flex min-h-52 flex-col justify-end overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-64">
            <DepartmentPhoto value="collectibles" eager className="absolute inset-0 h-full w-full object-center motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"/>
            <div className="category-photo-shade absolute inset-0"/>
            <div className="relative max-w-2xl p-5 sm:p-8"><p className="mb-2 text-xs font-bold text-primary">SIGNATURE DEPARTMENT</p><h2 className="text-2xl font-bold sm:text-3xl">Trading Cards & Collectibles</h2><p className="mt-2 text-sm text-foreground">Trading cards, sports cards, figures & memorabilia</p><ArrowRight className="mt-4 h-6 w-6 text-primary" aria-hidden/></div>
          </Link>}
          <nav aria-label="Department shortcuts" className="mb-5 flex gap-2 overflow-x-auto pb-2 md:hidden">{departments.map(d => <Link onClick={close} key={d.value} to="/marketplace/$department" params={{department:d.slug}} search={{}} className="shrink-0 rounded-md border border-border px-3 py-3 text-xs font-semibold">{departmentDisplayLabel(d)}</Link>)}</nav>
          <h2 className="mb-4 text-lg font-bold">Shop every department</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">{matches.filter(d => d.value !== 'collectibles').map(d => <Link key={d.value} onClick={close} to="/marketplace/$department" params={{department:d.slug}} search={{}} className="group min-w-0 overflow-hidden rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="aspect-[16/10] overflow-hidden"><DepartmentPhoto value={d.value} className="h-full w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"/></div>
            <div className="p-3"><h3 className="text-sm font-semibold">{departmentDisplayLabel(d)}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.subcategories.slice(0,3).map(s => s.label).join(' · ')}</p></div>
          </Link>)}</div>
          {matches.length === 0 && <p role="status" className="py-10 text-center text-muted-foreground">No departments match “{query}”.</p>}
          <div className="mt-7 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <Link onClick={close} to="/shop" className="flex min-w-0 items-center gap-3 py-2"><Store className="shrink-0 text-primary"/><div><p className="font-bold">PB Store</p><p className="text-sm text-muted-foreground">TCG & collectibles</p></div><ArrowRight className="ml-auto shrink-0 text-primary"/></Link>
            <Link onClick={close} to="/bazaar" className="flex min-w-0 items-center gap-3 py-2"><ShoppingBag className="shrink-0 text-primary"/><div><p className="font-bold">PB Bazaar</p><p className="text-sm text-muted-foreground">General merchandise retail</p></div><ArrowRight className="ml-auto shrink-0 text-primary"/></Link>
          </div>
          <Link onClick={close} to="/market" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Browse all Marketplace listings <ArrowRight className="h-4 w-4"/></Link>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}