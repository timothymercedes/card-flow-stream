import { MARKET_DEPARTMENTS, type ProductDetails } from './marketplaceDepartments';
import { LISTING_CATEGORIES } from './listingCategories';

const content: Record<string, { slug: string; description: string; subcategories: string[] }> = {
  automotive: { slug: 'automotive', description: 'Vehicles, parts and accessories.', subcategories: ['Vehicles', 'Parts', 'Accessories', 'Tires & Wheels'] },
  electronics: { slug: 'electronics', description: 'Phones, computers, cameras and everyday technology.', subcategories: ['Phones', 'Computers', 'TVs', 'Cameras', 'Audio', 'Accessories'] },
  collectibles: { slug: 'collectibles', description: 'Trading cards, rare finds and collectibles for your next discovery.', subcategories: [] },
  fashion: { slug: 'fashion', description: 'Clothing, sneakers and accessories with individual style.', subcategories: ['Clothing', 'Sneakers', 'Shoes', 'Bags', 'Accessories'] },
  tools: { slug: 'tools', description: 'Tools and equipment for your next project.', subcategories: ['Hand Tools', 'Power Tools', 'Construction Equipment', 'Accessories'] },
  home: { slug: 'home', description: 'Furniture, decor and useful finds for your home.', subcategories: ['Furniture', 'Decor', 'Appliances', 'Household Goods'] },
  sports_outdoors: { slug: 'sports-outdoors', description: 'Equipment for sport, adventure and outdoor recreation.', subcategories: ['Sports Equipment', 'Camping', 'Cycling', 'Outdoor Recreation'] },
  gaming: { slug: 'gaming', description: 'Consoles, games and gear for your next session.', subcategories: ['Consoles', 'Games', 'Accessories', 'Gaming Equipment'] },
  business: { slug: 'business-industrial', description: 'Commercial supplies, machinery and workplace essentials.', subcategories: ['Industrial Machinery', 'Office Equipment', 'Commercial Supplies'] },
  music: { slug: 'music-entertainment', description: 'Instruments, music and entertainment discoveries.', subcategories: ['Instruments', 'Audio Equipment', 'Music Media', 'Entertainment Items'] },
  garden_outdoors: { slug: 'garden-outdoors', description: 'Gardening, outdoor furniture and outdoor living.', subcategories: ['Gardening Tools', 'Plants', 'Outdoor Furniture', 'Outdoor Living'] },
};
const order = ['automotive', 'electronics', 'collectibles', 'fashion', 'tools', 'home', 'sports_outdoors', 'gaming', 'business', 'music', 'garden_outdoors'];

export const SHOPPING_DEPARTMENTS = order.flatMap(value => {
  const base = MARKET_DEPARTMENTS.find(d => d.value === value) ?? (value === 'garden_outdoors' ? { value, label: 'Garden & Outdoors', emoji: '🌱' } : undefined);
  const config = content[value];
  if (!base || !config) return [];
  return [{ ...base, ...config, canList: value !== 'garden_outdoors', subcategories: value === 'collectibles'
    ? LISTING_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
    : config.subcategories.map(label => ({ value: label, label })) }];
});

export function shoppingDepartment(slug: string) {
  return SHOPPING_DEPARTMENTS.find(d => d.slug === slug);
}

export function subcategoryFilters(department: string, subcategory: string, filters: ProductDetails = {}) {
  const { category: _category, type: _type, ...rest } = filters;
  return subcategory ? { ...rest, [department === 'collectibles' ? 'category' : 'type']: subcategory } : rest;
}

export function departmentStreamsMatch(department: string, category: string | null) {
  if (!category) return false;
  if (department === 'collectibles') return LISTING_CATEGORIES.some(c => c.value === category) || category === 'collectibles';
  return category === department;
}