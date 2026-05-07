import { useEffect, useMemo, useState } from "react";
import { Play, CheckCircle2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TutorialPlayer, type Tutorial } from "./TutorialPlayer";

type Audience = "buyer" | "seller" | "host" | "flex" | "auction" | "general";

const AUDIENCE_TABS: { key: Audience; label: string }[] = [
  { key: "buyer", label: "Buyers" },
  { key: "seller", label: "Sellers" },
  { key: "host", label: "Hosts" },
  { key: "flex", label: "Flex Live" },
  { key: "auction", label: "Auctions" },
  { key: "general", label: "General" },
];

type Row = Tutorial & { audience: Audience; thumbnail_url: string | null; duration_seconds: number | null };

export function TutorialLibrary({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Audience>("buyer");
  const [items, setItems] = useState<Row[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Tutorial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("tutorials")
        .select("id,title,description,audience,video_url,captions_url,thumbnail_url,duration_seconds,order_index")
        .eq("is_published", true)
        .order("audience").order("order_index");
      if (cancel) return;
      setItems((data as any[]) || []);
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: prog } = await supabase.from("tutorial_progress")
          .select("tutorial_id, completed_at").eq("user_id", u.user.id);
        if (!cancel) setCompleted(new Set(((prog as any[]) || []).filter(p => p.completed_at).map(p => p.tutorial_id)));
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const visible = useMemo(() => items.filter(i => i.audience === tab), [items, tab]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-background/60 px-3 py-2">
        <button onClick={onBack} className="rounded-full p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-sm font-bold">Tutorial videos</p>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {AUDIENCE_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <p className="text-center text-xs text-muted-foreground py-4">Loading…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">No videos here yet — check back soon.</p>
        )}
        {visible.map(t => (
          <button key={t.id} onClick={() => setActive(t)}
            className="flex w-full items-center gap-3 rounded-xl bg-muted/50 p-2 text-left hover:bg-muted">
            <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black">
              {t.thumbnail_url ? (
                <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Play className="h-5 w-5 text-white/70" /></div>
              )}
              {completed.has(t.id) && (
                <CheckCircle2 className="absolute right-0.5 top-0.5 h-4 w-4 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{t.title}</p>
              {t.description && <p className="line-clamp-2 text-[10px] text-muted-foreground">{t.description}</p>}
              {t.duration_seconds ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{Math.floor(t.duration_seconds / 60)}:{String(t.duration_seconds % 60).padStart(2, "0")}</p>
              ) : null}
            </div>
          </button>
        ))}
      </div>
      {active && <TutorialPlayer tutorial={active} onClose={() => setActive(null)} />}
    </div>
  );
}
