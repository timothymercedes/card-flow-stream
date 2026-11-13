import { queryOptions } from '@tanstack/react-query';
import { departmentStreamsMatch, shoppingDepartment, subcategoryFilters } from './categoryShoppingConfig';
import type { ProductDetails } from './marketplaceDepartments';

export type ShoppingListing = {
  id: string; title: string; description: string | null; image_url: string | null; seller_id: string;
  category: string; department: string; product_details: ProductDetails;
  price: number | null; starting_bid: number | null; current_bid: number | null; buy_now_price: number | null;
  is_auction: boolean; listing_type: string; accepts_offers: boolean; created_at: string;
  storefront_name: string | null; storefront_username: string | null;
};
export type ShoppingSearch = { q?: string; subcategory?: string; filters?: ProductDetails; sort?: string; page?: number };
type Catalog = { items: ShoppingListing[]; total: number };
type PublicShow = { id: string; title: string; thumbnail_url: string | null; category: string | null; status: string };

// Only the publishable browser configuration is used. All reads remain bounded
// by the existing public search projection / public show policies, even signed in.
async function publicRead<T>(path: string, body?: unknown): Promise<T> {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: key, ...(key?.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error('Shopping is unavailable. Please try again.');
  return response.json();
}

export function catalogRequest(department: string, search: ShoppingSearch, limit = 40) {
  const sort = ['newest', 'price_asc', 'price_desc', 'ending_soon'].includes(search.sort ?? '') ? search.sort : 'newest';
  return { _query: (search.q ?? '').slice(0, 200), _department: department,
    _filters: { ...subcategoryFilters(department, search.subcategory ?? '', search.filters), sort },
    _page: Math.max(1, Math.min(10000, Math.floor(search.page ?? 1))), _limit: limit };
}

export const categoryCatalogOptions = (department: string, search: ShoppingSearch) => queryOptions({
  queryKey: ['category-catalog', department, search],
  queryFn: () => publicRead<Catalog>('rpc/search_marketplace', catalogRequest(department, search)),
  staleTime: 15_000,
});

export const categoryOverviewOptions = (department: string) => queryOptions({
  queryKey: ['category-overview', department],
  queryFn: async () => {
    const [recent, trending, shows] = await Promise.all([
      publicRead<Catalog>('rpc/search_marketplace', catalogRequest(department, { sort: 'newest' }, 12)),
      publicRead<Catalog>('rpc/search_marketplace', catalogRequest(department, { filters: { kind: 'trending' } }, 12)),
      publicRead<PublicShow[]>('live_streams?select=id,title,thumbnail_url,category,status&is_private=eq.false&status=in.(live,scheduled)&order=created_at.desc&limit=60'),
    ]);
    return { recent, trending, shows: shows.filter(s => departmentStreamsMatch(department, s.category)) };
  },
  staleTime: 15_000,
});

export function inventoryBrands(items: ShoppingListing[]) {
  return [...new Set(items.map(l => l.product_details?.brand?.trim()).filter((brand): brand is string => !!brand))].sort();
}

export function validDepartment(slug: string) { return shoppingDepartment(slug)?.value; }