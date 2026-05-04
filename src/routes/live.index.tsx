import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/live/")({ component: LiveList });

function LiveList() {
  const [streams, setStreams] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("live_streams").select("*").eq("is_active", true).order("created_at", { ascending: false }).then(({ data }) => setStreams(data || []));
  }, []);
  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Live Now</h1>
        {streams.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No active streams. Be the first to go live!</p>}
        <div className="grid grid-cols-2 gap-3">
          {streams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }}>
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {s.thumbnail_url ? <img src={s.thumbnail_url} className="h-full w-full object-cover" alt={s.title} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-live/30"><Radio className="h-10 w-10" /></div>}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-live px-2 py-0.5 text-[10px] font-bold">
                  <span className="h-1.5 w-1.5 live-pulse rounded-full bg-live-foreground" /> LIVE
                </div>
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-primary">${Number(s.current_bid).toFixed(0)}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
