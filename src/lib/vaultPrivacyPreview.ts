export const CARD_AUDIENCES = ['private', 'followers', 'friends', 'public', 'inherit'] as const;
export type CardAudience = typeof CARD_AUDIENCES[number];
export type PrivacyCard = { id: string; name: string; visibility: string | null };
export function applySelectedPrivacy(cards: PrivacyCard[], selected: readonly string[], audience: CardAudience): PrivacyCard[] {
  const ids = new Set(selected);
  return cards.map(card => ids.has(card.id) ? { ...card, visibility: audience } : card);
}
export type ShowRole = 'host' | 'cohost' | 'moderator';
export function selectedShowCards(cards: PrivacyCard[], selected: readonly string[], role: ShowRole, granted: boolean) {
  if (role !== 'host' && !granted) return [];
  return cards.filter(card => selected.includes(card.id));
}