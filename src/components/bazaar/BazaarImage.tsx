import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signPublicBazaarMedia } from "@/lib/bazaarMedia.functions";

const cache = new Map<string, Promise<string | null>>();

/** Resolve a Bazaar media value: full URLs pass through; private storage paths get a short-lived signed link. */
export function resolveBazaarMedia(value: string): Promise<string | null> {
  if (/^https?:\/\//.test(value)) return Promise.resolve(value);
  let p = cache.get(value);
  if (!p) {
    p = supabase.storage.from("bazaar-media").createSignedUrl(value, 3600).then(async ({ data }) => data?.signedUrl ?? (await signPublicBazaarMedia({ data: { path: value } }).catch(() => null)));
    cache.set(value, p);
    setTimeout(() => cache.delete(value), 50 * 60 * 1000);
  }
  return p;
}

export function BazaarImage({ src, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const [url, setUrl] = useState<string | null>(/^https?:\/\//.test(src) ? src : null);
  useEffect(() => { let on = true; resolveBazaarMedia(src).then((u) => on && setUrl(u)); return () => { on = false; }; }, [src]);
  return url ? <img src={url} {...rest} /> : <div className={rest.className} aria-hidden />;
}
