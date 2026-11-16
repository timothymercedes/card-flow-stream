import { describe, it, expect } from 'vitest';
import { isVaultItem } from './vaultSections';
describe('isVaultItem', () => {
  it('treats a vacuum in Home & Living as an item', () => expect(isVaultItem({ category: 'Home & Living', tcg_number: null })).toBe(true));
  it('treats a Pokémon card as a card', () => expect(isVaultItem({ category: 'Pokémon', tcg_number: '4/102' })).toBe(false));
  it('treats a Collectibles entry with a card number as a card', () => expect(isVaultItem({ category: 'Collectibles', tcg_number: '12' })).toBe(false));
});
