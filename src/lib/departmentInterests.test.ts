import {describe, it, expect} from 'vitest';
import {interestDepartments, orderedDepartments, prioritizeInterestListings, mergeDepartmentInterests} from './departmentInterests';

describe('department interest rules', () => {
  it('keeps collectibles first even when only general retail is selected', () => {
    expect(orderedDepartments(['electronics'])[0].value).toBe('collectibles');
    expect(orderedDepartments(['electronics'])[1].value).toBe('electronics');
  });
  it('keeps all eleven departments accessible regardless of interests', () => {
    expect(orderedDepartments(['gaming']).map(d=>d.value).sort()).toEqual(['automotive','electronics','collectibles','fashion','tools','home','sports_outdoors','gaming','business','music','garden_outdoors'].sort());
  });
  it('accepts no interests and multiple interests', () => {
    expect(interestDepartments([])).toEqual([]);
    expect(interestDepartments(['electronics','gaming'])).toEqual(['electronics','gaming']);
  });
  it('preserves existing collectible preferences when editing department interests', () => {
    expect(mergeDepartmentInterests(['pokemon','electronics'],['gaming'])).toEqual(['gaming','pokemon']);
    expect(interestDepartments(['sports'])).toEqual(['collectibles']);
  });
  it('reorders matching products without hiding other departments', () => {
    expect(prioritizeInterestListings([{category:'pokemon',id:'card'},{department:'electronics',id:'camera'},{department:'gaming',id:'game'}],['gaming']).map(l=>l.id)).toEqual(['game','card','camera']);
  });
});