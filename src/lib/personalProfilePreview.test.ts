import { describe, expect, it } from 'vitest';
import { canReadPersonalTimeline, personalPreviewEnabled, personalDraftKey } from './personalProfilePreview';
describe('preview profile approval boundaries', () => {
  it('does not activate the redesign on the public build', () => {
    expect(personalPreviewEnabled(false)).toBe(false);
    expect(personalPreviewEnabled(true)).toBe(true);
  });
  it('reads the existing timeline only for its owner until privacy approval', () => {
    expect(canReadPersonalTimeline('owner', 'owner')).toBe(true);
    expect(canReadPersonalTimeline('visitor', 'owner')).toBe(false);
    expect(canReadPersonalTimeline(undefined, 'owner')).toBe(false);
  });
  it('separates browser drafts between accounts', () => {
    expect(personalDraftKey('one')).not.toBe(personalDraftKey('two'));
  });
});