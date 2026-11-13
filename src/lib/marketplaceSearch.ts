import { supabase } from '@/integrations/supabase/client';
import type { ProductDetails } from './marketplaceDepartments';

export async function searchMarketplace(q = '', department = 'all', filters: ProductDetails = {}, page = 1, limit = 40) {
  const { data, error } = await supabase.rpc('search_marketplace', {
    _query: q.slice(0,200), _department: department, _filters: filters, _page: page, _limit: limit,
  });
  if (error) throw new Error('Marketplace search is unavailable. Please try again.');
  return data as unknown as { items: Record<string, any>[]; total: number };
}