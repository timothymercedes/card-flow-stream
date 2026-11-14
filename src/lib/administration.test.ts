import { describe, expect, it } from 'vitest';
import { canEnterAdministration, administrationSection } from './administration';
describe('preview administration boundary', () => {
  it('permits the existing protected owner role', () => expect(canEnterAdministration(['owner'])).toBe(true));
  it('permits the existing protected admin role', () => expect(canEnterAdministration(['admin'])).toBe(true));
  it('does not grant portal access to customers or sellers', () => expect(canEnterAdministration(['user', 'seller'])).toBe(false));
  it('does not implicitly authorize moderator or support membership', () => expect(canEnterAdministration(['moderator', 'support'])).toBe(false));
  it('fails closed without roles', () => expect(canEnterAdministration([])).toBe(false));
  it('defaults unknown section input to the overview', () => expect(administrationSection('external')).toBe('overview'));
});