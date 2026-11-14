import { createFileRoute, Link, notFound, useNavigate, useRouter } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient, useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { zodValidator } from '@tanstack/zod-adapter';
import { ArrowRight, Search, SlidersHorizontal, Radio, Tag, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DepartmentNavigation } from '@/components/DepartmentNavigation';
import { CategoryListingCard } from '@/components/CategoryListingCard';
import { shoppingDepartment } from '@/lib/categoryShoppingConfig';
import { categoryCatalogOptions, categoryOverviewOptions, inventoryBrands, type ShoppingSearch, type ShoppingListing } from '@/lib/categoryShoppingData';
import { filterFields, GENERAL_CONDITIONS } from '@/lib/marketplaceDepartments';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { DepartmentPhoto } from '@/components/DepartmentPhoto';
import { departmentDisplayLabel } from '@/lib/departmentPhotography';

const schema = z.object({ q: z.string().optional(), subcategory: z.string().optional(), filters: z.record(z.string(),z.string()).optional(), sort: z.string().optional(), page: z.number().optional() });

export const Route = createFileRoute('/marketplace/$department')({
  validateSearch: zodValidator(schema),
  loaderDeps: ({search}) => search,
  beforeLoad: ({params}) => { if (!shoppingDepartment(params.department)) throw notFound(); },
  loader: async ({context, params, deps}) => {
    const department = shoppingDepartment(params.department);
    if (!department) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(categoryCatalogOptions(department.value, deps)),
      context.queryClient.ensureQueryData(categoryOverviewOptions(department.value)),
    ]);
  },
  head: ({params}) => {
    const department = shoppingDepartment(params.department);
    const title = department ? `${departmentDisplayLabel(department)} — PullBid Live Marketplace` : 'Department unavailable — PullBid Live';
    const description = department ? `Shop ${departmentDisplayLabel(department).toLowerCase()} on PullBid Live. ${department.description}` : 'Explore PullBid Live marketplace departments.';
    return {meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};
  },
  component: CategoryShopping,
  errorComponent: CategoryError,
  notFoundComponent: () => <AppShell><div className="p-8"><h1 className="text-xl font-bold">Department not found</h1><Link to="/market" className="mt-4 inline-block text-primary">Browse Marketplace</Link></div></AppShell>,
  pendingComponent: () => <AppShell><div className="mx-auto max-w-7xl space-y-4 p-4" aria-label="Loading department"><div className="h-24 animate-pulse rounded-lg bg-muted"/><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({length:4},(_,i)=><div key={i} className="aspect-square animate-pulse rounded-lg bg-muted"/>)}</div></div></AppShell>,
});

function CategoryError() {
  const router = useRouter();
  const boundary = useQueryErrorResetBoundary();
  const client = useQueryClient();
  return <AppShell><div role="alert" className="p-8"><h1 className="text-xl font-bold">Shopping is unavailable</h1><Button className="mt-4" onClick={() => {boundary.reset(); void client.resetQueries({queryKey:['category-catalog']}); void client.resetQueries({queryKey:['category-overview']}); void router.invalidate();}}>Try again</Button></div></AppShell>;
}

function ProductSection({title, items, children}: {title:string;items:ShoppingListing[];children?:ReactNode}) {
  if (!items.length) return null;
  return <section className="py-5"><h2 className="mb-3 text-base font-bold">{title}</h2>{children}<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{items.slice(0,8).map(l=><CategoryListingCard key={l.id} listing={l}/>)}</div></section>;
}

function CategoryShopping() {
  const {department:slug} = Route.useParams();
  const department = shoppingDepartment(slug);
  if (!department) return null;
  return <DepartmentContent key={department.value} department={department}/>;
}

function DepartmentContent({department}: {department:NonNullable<ReturnType<typeof shoppingDepartment>>}) {
  const search = Route.useSearch();
  const navigate = useNavigate({from:'/marketplace/$department'});
  const client = useQueryClient();
  const {data:catalog} = useSuspenseQuery(categoryCatalogOptions(department.value,search));
  const {data:overview} = useSuspenseQuery(categoryOverviewOptions(department.value));
  const [filtersOpen,setFiltersOpen] = useState(false);
  const [queryDraft,setQueryDraft] = useState(search.q ?? '');
  useEffect(() => { setQueryDraft(search.q ?? ''); }, [search.q]);
  const update = (next:Partial<ShoppingSearch>) => navigate({search:prev=>({...prev,...next,page:next.page ?? 1}),resetScroll:false});
  const filters = search.filters ?? {};
  const page = Math.max(1,Math.floor(search.page ?? 1));
  const brands = inventoryBrands(overview.recent.items);
  const active = !!(search.q || search.subcategory || Object.values(filters).some(Boolean));
  useRealtimeTable({name:`department-${department.value}`,table:'listings',debounceMs:500},()=> {
    void client.invalidateQueries({queryKey:['category-catalog',department.value]});
    void client.invalidateQueries({queryKey:['category-overview',department.value]});
  });
  const field = (key:string) => update({filters:{...filters,[key]:''}});
  const controls = <div className="space-y-4">
    <label className="block text-xs text-muted-foreground">Listing type<select aria-label="Listing type" className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm text-foreground" value={filters.kind ?? ''} onChange={e=>update({filters:{...filters,kind:e.target.value}})}><option value="">All listings</option><option value="auction">Auction</option><option value="buy_now">Buy now</option><option value="make_offer">Make offer</option><option value="trending">Active bidding</option></select></label>
    {['min_price','max_price',...filterFields(department.value),...(department.value === 'collectibles'?['set','number']:[])].map(key=><label key={key} className="block text-xs capitalize text-muted-foreground">{key.replaceAll('_',' ')}<input aria-label={`Filter ${key.replaceAll('_',' ')}`} value={filters[key]??''} type={['min_price','max_price','year','max_mileage'].includes(key)?'number':'text'} min="0" className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm text-foreground" onChange={e=>update({filters:{...filters,[key]:e.target.value}})}/></label>)}
    <label className="block text-xs text-muted-foreground">Condition<select aria-label="Condition" className="mt-1 w-full rounded-lg bg-input px-3 py-2 text-sm text-foreground" value={filters.condition??''} onChange={e=>update({filters:{...filters,condition:e.target.value}})}><option value="">All conditions</option>{(department.value==='collectibles'?['NM','LP','MP','Damaged']:GENERAL_CONDITIONS).map(c=><option key={c}>{c}</option>)}</select></label>
    <Button variant="ghost" onClick={()=>update({q:undefined,subcategory:undefined,filters:{},sort:'newest'})}><X className="h-4 w-4"/>Clear filters</Button>
  </div>;
  return <AppShell><div className="mx-auto w-full min-w-0 max-w-7xl">
    <DepartmentNavigation selected={department.value}/>
    <div className="px-4 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 py-4 text-xs text-muted-foreground"><Link to="/">Home</Link><span>/</span><Link to="/market">Marketplace</Link><span>/</span><span className="text-foreground">{department.label}</span></nav>
      <header className="border-b border-border/60 pb-5">
        <div className="relative flex min-h-52 flex-col justify-end overflow-hidden rounded-lg p-5 sm:min-h-64 sm:p-8"><DepartmentPhoto value={department.value} eager className="absolute inset-0 h-full w-full"/><div className="category-photo-shade absolute inset-0"/><div className="relative max-w-xl">{department.value === 'collectibles' && <p className="mb-2 text-xs font-bold text-primary">SIGNATURE DEPARTMENT</p>}<h1 className="text-2xl font-bold sm:text-3xl">{departmentDisplayLabel(department)}</h1><p className="mt-2 text-sm text-foreground">{department.description}</p></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={e=>{e.preventDefault();void update({q:queryDraft});}}>
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input aria-label={`Search ${department.label}`} placeholder={`Search ${department.label.toLowerCase()}…`} value={queryDraft} onChange={e=>setQueryDraft(e.target.value)} className="h-10 w-full rounded-full bg-input pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/></div>
            <Button size="icon" type="submit" aria-label="Search department" title="Search department"><ArrowRight className="h-4 w-4"/></Button>
          </form>
          <Link to="/market" search={{q:queryDraft,department:'all'}} className="text-xs font-semibold text-primary">Global search</Link>
        </div>
        <nav aria-label="Subcategories" className="mt-3 flex gap-1 overflow-x-auto pb-1"><Link to="/marketplace/$department" params={{department:department.slug}} search={prev=>({...prev,subcategory:undefined,page:1})} resetScroll={false} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-primary">All {department.label}</Link>{department.subcategories.map(s=><Link key={s.value} to="/marketplace/$department" params={{department:department.slug}} search={prev=>({...prev,subcategory:s.value,page:1})} resetScroll={false} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${search.subcategory===s.value?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground'}`}>{s.label}</Link>)}</nav>
        {department.value==='collectibles' && <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-primary"><Link to="/vault">Vault & card scanner</Link><Link to="/collection">Collection books</Link></div>}
      </header>
      {!active && <>
        <ProductSection title="Trending products · active bidding" items={overview.trending.items}/>
        {brands.length>0 && <section className="py-5"><h2 className="mb-3 text-base font-bold">Brands in recent listings</h2><div className="flex flex-wrap gap-2">{brands.map(brand=><Link key={brand} to="/marketplace/$department" params={{department:department.slug}} search={prev=>({...prev,filters:{...prev.filters,brand},page:1})} className="rounded-full border border-border px-3 py-2 text-xs font-semibold">{brand}</Link>)}</div></section>}
        {overview.shows.length>0 && <section className="py-5"><h2 className="mb-3 text-base font-bold">Live auctions & shopping shows</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{overview.shows.map(s=><Link key={s.id} to="/live/$id" params={{id:s.id}} className="overflow-hidden rounded-xl bg-card ring-1 ring-border"><div className="relative aspect-video bg-muted">{s.thumbnail_url?<img src={s.thumbnail_url} alt={s.title} className="h-full w-full object-cover"/>:<Radio className="mx-auto h-full w-8 text-muted-foreground"/>}<span className="absolute left-2 top-2 rounded-full bg-live px-2 py-1 text-[10px] font-bold text-live-foreground">{s.status==='live'?'LIVE':'UPCOMING'}</span></div><p className="p-3 text-sm font-semibold">{s.title}</p></Link>)}</div></section>}
        <ProductSection title="Recently added" items={overview.recent.items}/>
      </>}
      <section className="py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">All {department.label} listings</h2><p className="text-xs text-muted-foreground">{catalog.total} results</p></div><div className="flex gap-2"><Button className="lg:hidden" size="sm" variant="outline" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal className="h-4 w-4"/>Filters</Button><select aria-label="Sort listings" value={search.sort??'newest'} onChange={e=>update({sort:e.target.value})} className="max-w-40 rounded-lg bg-input px-2 py-2 text-xs"><option value="newest">Newest</option><option value="price_asc">Lowest price</option><option value="price_desc">Highest price</option><option value="ending_soon">Ending soon</option></select></div></div>
        <div className="flex flex-wrap gap-2 pb-3">{search.subcategory && <Button variant="outline" size="sm" onClick={()=>update({subcategory:undefined})}>{search.subcategory}<X className="h-3 w-3"/></Button>}{Object.entries(filters).filter(([,v])=>v).map(([key,value])=><Button key={key} variant="outline" size="sm" onClick={()=>field(key)}>{key.replaceAll('_',' ')}: {value}<X className="h-3 w-3"/></Button>)}</div>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[180px_minmax(0,1fr)]"><aside className="hidden lg:block">{controls}</aside><div className="min-w-0">
          {catalog.items.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{catalog.items.map(l=><CategoryListingCard key={l.id} listing={l}/>)}</div> : <div className="border-y border-dashed border-border py-12 text-center"><Tag className="mx-auto mb-3 h-7 w-7 text-muted-foreground"/><p className="text-sm font-semibold">{active?'No listings match':'No published listings yet'}</p><Link to="/market" className="mt-3 inline-block text-xs font-semibold text-primary">Browse all departments</Link></div>}
          <div className="mt-5 flex items-center justify-center gap-3"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>update({page:page-1})}>Previous</Button><span className="text-xs text-muted-foreground">Page {page}</span><Button variant="outline" size="sm" disabled={page*40>=catalog.total} onClick={()=>update({page:page+1})}>Next</Button></div>
        </div></div>
      </section>
    </div>
    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}><SheetContent side="right" className="w-[85vw] overflow-y-auto"><SheetHeader><SheetTitle>{department.label} filters</SheetTitle></SheetHeader><div className="px-4 py-5">{controls}</div></SheetContent></Sheet>
  </div></AppShell>;
}