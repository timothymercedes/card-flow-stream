import { useEffect, useState } from "react";
import { BAZAAR_CART_KEY, parseCart, type CartItem } from "@/lib/bazaarShopping";

const EVENT = "pbl-bazaar-cart-change";
export function useBazaarCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const read = () => {
      try { setItems(parseCart(localStorage.getItem(BAZAAR_CART_KEY))); setStorageError(false); }
      catch { setStorageError(true); }
      setReady(true);
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === BAZAAR_CART_KEY) read(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, read);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, read); };
  }, []);
  const update = (transform: (previous: CartItem[]) => CartItem[]) => {
    const previous = parseCart(localStorage.getItem(BAZAAR_CART_KEY));
    const next = transform(previous);
    try { localStorage.setItem(BAZAAR_CART_KEY, JSON.stringify(next)); }
    catch { setStorageError(true); throw new Error("Your browser couldn't save the cart. Allow site storage and try again."); }
    setItems(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return { items, ready, storageError, update };
}