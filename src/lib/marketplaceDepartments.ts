export const MARKET_DEPARTMENTS = [
  { value: 'automotive', label: 'Automotive', emoji: '🚘' },
  { value: 'electronics', label: 'Electronics', emoji: '💻' },
  { value: 'tools', label: 'Tools & Equipment', emoji: '🛠️' },
  { value: 'collectibles', label: 'Trading Cards & Collectibles', emoji: '✨' },
  { value: 'fashion', label: 'Fashion', emoji: '👟' },
  { value: 'home', label: 'Home & Furniture', emoji: '🛋️' },
  { value: 'sports_outdoors', label: 'Sports & Outdoors', emoji: '🏕️' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮' },
  { value: 'business', label: 'Business & Industrial', emoji: '🏭' },
  { value: 'music', label: 'Music & Entertainment', emoji: '🎸' },
] as const;

export type ProductDetails = Record<string, string>;
export const GENERAL_CONDITIONS = ['New', 'Like new', 'Good', 'Fair', 'For parts'];
export function listingDepartment(listing: { department?: string | null; category?: string | null }) {
  return listing.department || (MARKET_DEPARTMENTS.find(d => d.value !== 'collectibles' && d.value === listing.category)?.value ?? 'collectibles');
}
export function detailFields(department: string) {
  if (department === 'automotive') return ['make', 'model', 'year', 'mileage', 'location'];
  if (department === 'electronics') return ['brand', 'model'];
  if (department === 'tools') return ['brand', 'type'];
  if (department === 'collectibles') return ['grading_company', 'grade'];
  return ['brand', 'model'];
}
export function filterFields(department: string) {
  return department === 'all' ? ['brand'] : detailFields(department).map(f => f === 'mileage' ? 'max_mileage' : f);
}
export function retainCommonFilters(filters: ProductDetails) {
  return Object.fromEntries(Object.entries(filters).filter(([k]) => ['min_price','max_price','brand','kind','sort'].includes(k)));
}
export function matchesProductSearch(listing: Record<string, unknown>, query: string) {
  const department = listingDepartment(listing);
  return [listing.title, listing.description, listing.category, listing.tcg_set, listing.tcg_number,
    listing.storefront_name, listing.storefront_username, MARKET_DEPARTMENTS.find(d => d.value === department)?.label,
    ...Object.values((listing.product_details ?? {}) as ProductDetails)].join(' ').toLowerCase().includes(query.toLowerCase().trim());
}
export function validateProductDetails(details: ProductDetails) {
  for (const [key, value] of Object.entries(details)) {
    if (value.length > 200) return `${key.replaceAll('_', ' ')} must be at most 200 characters`;
    if (['year','mileage'].includes(key) && value && (!/^\d+$/.test(value) || Number(value) < 0)) return `Enter a valid ${key}`;
  }
  return null;
}