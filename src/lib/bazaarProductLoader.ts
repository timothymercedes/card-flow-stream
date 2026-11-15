import { getBazaarShoppingProducts } from "./bazaarShopping.functions";
import { getBazaarPrivateTestProducts } from "./bazaarPreview.functions";
import type { ShoppingProduct } from "./bazaarShopping";

/** Public products first; signed-in admins also get private_test items (others get nothing extra). */
export async function loadCheckoutProducts(ids: string[], signedIn: boolean): Promise<ShoppingProduct[]> {
  const pub = await getBazaarShoppingProducts({ data: { ids } });
  const missing = ids.filter((id) => !pub.some((p) => p.id === id));
  if (!missing.length || !signedIn) return pub;
  const priv = await getBazaarPrivateTestProducts({ data: { ids: missing } }).catch(() => []);
  return [...pub, ...priv];
}
