import { VAULT_ITEM_CATEGORIES } from './vaultItemIdentify.functions';

const ITEM_CATEGORIES = new Set<string>(VAULT_ITEM_CATEGORIES);

/** A Vault entry is a general item (not a trading card) when it uses an Add-item category and has no card number. */
export function isVaultItem(c: { category?: string | null; tcg_number?: string | null }) {
  return ITEM_CATEGORIES.has(c.category || '') && !c.tcg_number;
}
