import { SHOPPING_DEPARTMENTS } from './categoryShoppingConfig';
import { LISTING_CATEGORIES } from './listingCategories';
import { listingDepartment } from './marketplaceDepartments';

export function interestDepartments(interests: readonly string[] = []) {
  const keys = new Set(interests.map(value => LISTING_CATEGORIES.some(c => c.value === value) ? 'collectibles' : value));
  return SHOPPING_DEPARTMENTS.filter(d => keys.has(d.value)).map(d => d.value);
}

export function orderedDepartments(interests: readonly string[] = []) {
  const selected = interestDepartments(interests);
  return [...SHOPPING_DEPARTMENTS].sort((a, b) => {
    const score = (value: string) => value === 'collectibles' ? 2 : selected.includes(value) ? 1 : 0;
    return score(b.value) - score(a.value);
  });
}

export function prioritizeInterestListings<T extends {department?: string | null; category?: string | null}>(items: T[], interests: readonly string[]) {
  const departments = interestDepartments(interests);
  return [...items].sort((a,b) => Number(departments.includes(listingDepartment(b))) - Number(departments.includes(listingDepartment(a))));
}

// Keep specific collectible preferences from existing accounts when department selections change.
export function mergeDepartmentInterests(previous: readonly string[], selected: readonly string[]) {
  return [...new Set([...selected, ...previous.filter(value => LISTING_CATEGORIES.some(c => c.value === value))])];
}