import { describe, it, expect } from 'vitest';
import { MARKET_DEPARTMENTS, listingDepartment, detailFields, filterFields, retainCommonFilters, matchesProductSearch, validateProductDetails } from './marketplaceDepartments';

describe('shared marketplace departments', () => {
  it('includes all ten requested departments', () => {
    expect(MARKET_DEPARTMENTS.map(d => d.label)).toEqual(['Automotive','Electronics','Tools & Equipment','Trading Cards & Collectibles','Fashion','Home & Furniture','Sports & Outdoors','Gaming','Business & Industrial','Music & Entertainment']);
  });
  it('keeps sports cards distinct from equipment', () => {
    expect(listingDepartment({ category:'sports' })).toBe('collectibles');
    expect(listingDepartment({ department:'sports_outdoors' })).toBe('sports_outdoors');
  });
  it('preserves legacy collectible mappings', () => {
    for (const category of ['pokemon','one_piece','magic','yugioh','other']) expect(listingDepartment({category})).toBe('collectibles');
  });
  it('searches product descriptions and brands', () => {
    expect(matchesProductSearch({description:'cordless drill',product_details:{brand:'Makita'}},'Makita')).toBe(true);
    expect(matchesProductSearch({description:'cordless drill'},'drill')).toBe(true);
    expect(matchesProductSearch({department:'tools',description:'cordless drill'},'automotive')).toBe(false);
  });
  it('searches categories and public storefront names', () => {
    expect(matchesProductSearch({department:'home'},'Furniture')).toBe(true);
    expect(matchesProductSearch({storefront_name:'Silvestre Shop'},'Silvestre')).toBe(true);
  });
  it('has automotive make model year mileage location filters', () => expect(detailFields('automotive')).toEqual(['make','model','year','mileage','location']));
  it('has electronics brand and model filters', () => expect(detailFields('electronics')).toEqual(['brand','model']));
  it('has tool brand and type filters', () => expect(detailFields('tools')).toEqual(['brand','type']));
  it('has grading company and grade filters', () => expect(detailFields('collectibles')).toEqual(['grading_company','grade']));
  it('uses a maximum mileage search bound', () => expect(filterFields('automotive')).toContain('max_mileage'));
  it('clears incompatible filters and preserves price ranges', () => expect(retainCommonFilters({make:'Ford',min_price:'100',max_price:'500',brand:'Sony',grade:'10'})).toEqual({min_price:'100',max_price:'500',brand:'Sony'}));
  it('rejects invalid mileage but allows recorded values', () => {
    expect(validateProductDetails({mileage:'-10'})).toBeTruthy();
    expect(validateProductDetails({year:'2020',mileage:'10000'})).toBeNull();
  });
});