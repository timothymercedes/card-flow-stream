/**
 * MoreFromSeller — bottom-of-listing recommendations.
 * Shows two horizontally-scrolling rails:
 *   1. More from this seller (other live listings by same seller)
 *   2. Similar items (same category, different listings)
 * Hides rails that have no results.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getListingPriceDisplay, isPublicListingVisible } from "@/lib/listingDisplay";

function Rail({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 px-1 text-sm font-bold">{title}</h2>
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-3 pb-2">
          {items.map((l) => {
            const d = getListingPriceDisplay(l, true);
            return (
              <Link
                key={l.id}
                to="/market/$id"
                params={{ id: l.id }}
                className="group w-36 shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-border/60 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:ring-primary/50"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {l.image_url ? (
                    <img src={l.image_url} alt={l.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                  {d.kind === "price" ? (
                    <p className="mt-0.5 text-xs font-bold text-primary">{d.label}</p>
                  ) : d.kind === "offer" ? (
                    <p className="mt-0.5 text-[10px] font-bold text-primary">Make Offer</p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MoreFromSeller({
  sellerId,
  category,
  excludeId,
}: {
  sellerId?: string | null;
  category?: string | null;
  excludeId: string;
}) {
  const [seller, setSeller] = useState<any[]>([]);
  const [similar, setSimilar] = useState<any[]>([]);
  const [shopName, setShopName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const tasks: Promise<any>[] = [];

      if (sellerId) {
        tasks.push(
          supabase
            .from("listings")
            .select("*")
            .eq("seller_id", sellerId)
            .neq("id", excludeId)
            .gt("expires_at", nowIso)
            .order("created_at", { ascending: false })
            .limit(12),
        );
        tasks.push(
          supabase
            .from("profiles")
            .select("shop_name, username")
            .eq("id", sellerId)
            .maybeSingle(),
        );
      } else {
        tasks.push(Promise.resolve({ data: [] }));
        tasks.push(Promise.resolve({ data: null }));
      }

      if (category) {
        let q = supabase
          .from("listings")
          .select("*")
          .eq("category", category)
          .neq("id", excludeId)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(20);
        if (sellerId) q = q.neq("seller_id", sellerId);
        tasks.push(q);
      } else {
        tasks.push(Promise.resolve({ data: [] }));
      }

      const [a, p, b] = await Promise.all(tasks);
      if (cancelled) return;
      setSeller(((a?.data || []) as any[]).filter(isPublicListingVisible));
      setSimilar(((b?.data || []) as any[]).filter(isPublicListingVisible).slice(0, 12));
      if (p?.data) setShopName(p.data.shop_name || (p.data.username ? `@${p.data.username}` : ""));
    })();
    return () => { cancelled = true; };
  }, [sellerId, category, excludeId]);

  if (!seller.length && !similar.length) return null;
  return (
    <div className="mt-6 border-t border-border/60 pt-2">
      <Rail title={shopName ? `More from ${shopName}` : "More from this seller"} items={seller} />
      <Rail title="Similar items" items={similar} />
    </div>
  );
}
