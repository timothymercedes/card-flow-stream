import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/market/")({ component: Market });

function Market() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("listings").select("*").order("created_at", { ascending: false }).then(({ data }) => setItems(data || []));
  }, []);
  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Marketplace</h1>
        {items.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No listings yet</p>}
        <div className="grid grid-cols-2 gap-3">
          {items.map((l) => (
            <Link key={l.id} to="/market/$id" params={{ id: l.id }} className="overflow-hidden rounded-xl bg-card">
              <div className="aspect-square bg-muted">
                {l.image_url ? <img src={l.image_url} className="h-full w-full object-cover" alt={l.title} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-sm font-semibold">{l.title}</p>
                <p className="text-xs text-primary">${Number(l.is_auction ? l.current_bid || 0 : l.price || 0).toFixed(0)}{l.is_auction ? " bid" : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
