import { describe, it, expect } from 'vitest';
import { socialNotificationLink as f } from './personalProfileLinks';
describe('socialNotificationLink', () => {
  it('sends new follower to personal profile in preview', () => expect(f('new_follower', '/seller/Tim', true)).toBe('/preview/personal-profile-candidate?username=tim'));
  it('keeps storefront link outside preview', () => expect(f('new_follower', '/seller/tim', false)).toBe('/seller/tim'));
  it('never rewrites order links', () => expect(f('order', '/seller/tim', true)).toBe('/seller/tim'));
  it('ignores non-storefront links', () => expect(f('new_follower', '/orders', true)).toBe('/orders'));
});
