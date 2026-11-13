import { describe, expect, it } from 'vitest';
import { SHOPPING_DEPARTMENTS, shoppingDepartment, subcategoryFilters, departmentStreamsMatch } from './categoryShoppingConfig';
import { catalogRequest, PUBLIC_CATEGORY_SHOWS_PATH } from './categoryShoppingData';

describe('homepage department shopping', () => {
  it('excludes demo and private shows from real department activity', () => {
    const query = new URLSearchParams(PUBLIC_CATEGORY_SHOWS_PATH.split('?')[1]);
    expect(query.get('is_demo')).toBe('eq.false');
    expect(query.get('is_private')).toBe('eq.false');
  });
  it('includes eleven departments in the requested homepage order', () => {
    expect(SHOPPING_DEPARTMENTS.map(d => d.label)).toEqual(['Automotive','Electronics','Trading Cards & Collectibles','Fashion','Tools & Equipment','Home & Furniture','Sports & Outdoors','Gaming','Business & Industrial','Music & Entertainment','Garden & Outdoors']);
  });
  it('maps dedicated public URLs to existing department keys', () => {
    expect(shoppingDepartment('sports-outdoors')?.value).toBe('sports_outdoors');
    expect(shoppingDepartment('business-industrial')?.value).toBe('business');
    expect(shoppingDepartment('unknown')).toBeUndefined();
  });
  it('searches only the selected department', () => {
    expect(catalogRequest('automotive', {q:'Ford'})).toMatchObject({_department:'automotive',_query:'Ford'});
  });
  it('subcategory keeps the department and filters the stored product type', () => {
    expect(catalogRequest('electronics', {subcategory:'Phones'})).toMatchObject({_department:'electronics',_filters:{type:'Phones'}});
  });
  it('collectible subcategories preserve scanner and Vault category keys', () => {
    expect(subcategoryFilters('collectibles','sports',{type:'Phones',brand:'Topps'})).toEqual({category:'sports',brand:'Topps'});
  });
  it('clearing subcategory removes only incompatible category/type filters', () => {
    expect(subcategoryFilters('tools','',{type:'Power Tools',min_price:'5'})).toEqual({min_price:'5'});
  });
  it('does not mix sports cards shows with outdoor equipment shows', () => {
    expect(departmentStreamsMatch('collectibles','sports')).toBe(true);
    expect(departmentStreamsMatch('sports_outdoors','sports')).toBe(false);
    expect(departmentStreamsMatch('sports_outdoors','sports_outdoors')).toBe(true);
  });
  it('keeps Garden browsing separate without allowing unsupported seller writes', () => {
    expect(shoppingDepartment('garden-outdoors')).toMatchObject({value:'garden_outdoors',canList:false});
    expect(catalogRequest('garden_outdoors',{})._department).toBe('garden_outdoors');
  });
});