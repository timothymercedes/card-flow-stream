import { describe, expect, it } from 'vitest';
import { applySelectedPrivacy, selectedShowCards } from './vaultPrivacyPreview';
const cards = Array.from({ length: 34 }, (_, i) => ({ id: String(i), name: `Card ${i}`, visibility: 'private' }));
describe('approved Vault preview rules', () => {
  it('preserves all 34 existing private cards without an explicit selection', () => {
    expect(applySelectedPrivacy(cards, [], 'public')).toEqual(cards);
  });
  it('changes only the individually selected card', () => {
    const result = applySelectedPrivacy(cards, ['2'], 'followers');
    expect(result[2].visibility).toBe('followers');
    expect(result.filter(c => c.visibility === 'private')).toHaveLength(33);
  });
  it('applies bulk privacy only to selected cards and preserves IDs', () => {
    const result = applySelectedPrivacy(cards, ['1', '3'], 'friends');
    expect(result.filter(c => c.visibility === 'friends').map(c => c.id)).toEqual(['1', '3']);
    expect(result.map(c => c.id)).toEqual(cards.map(c => c.id));
  });
  it.each(['cohost', 'moderator'] as const)('requires show consent for %s', role => {
    expect(selectedShowCards(cards, ['1'], role, false)).toEqual([]);
    expect(selectedShowCards(cards, ['1'], role, true).map(c => c.id)).toEqual(['1']);
  });
  it('show selection never changes global card privacy', () => {
    expect(selectedShowCards(cards, ['1'], 'host', true)).toHaveLength(1);
    expect(cards.every(c => c.visibility === 'private')).toBe(true);
  });
});