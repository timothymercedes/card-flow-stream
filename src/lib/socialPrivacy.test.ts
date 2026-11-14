import { describe, expect, it } from 'vitest';
import { canReadPersonalTimeline } from './personalProfilePreview';

describe('visitor rollout stays fail-closed during media verification', () => {
  it('does not enable another user timeline while private media remains public', () => {
    expect(canReadPersonalTimeline('visitor-account', 'profile-owner')).toBe(false);
  });
  it('preserves the owner timeline during visitor rollout', () => {
    expect(canReadPersonalTimeline('profile-owner', 'profile-owner')).toBe(true);
  });
});