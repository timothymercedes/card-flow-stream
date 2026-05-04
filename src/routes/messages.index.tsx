import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { MessageCircle, Search } from "lucide-react";

export const Route = createFileRoute("/messages/")({ component: Messages });

function Messages() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [threads, setThreads] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`sender_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      const map = new Map<string, any>();
      for (const m of data || []) {
        const other = m.sender_id === user!.id ? m.recipient_id : m.sender_id;
        if (!map.has(other)) map.set(other, m);
      }
      const otherIds = [...map.keys()];
      if (!otherIds.length) return setThreads([]);
      const { data: profs } = await supabase.from("profiles").select("id,username").in("id", otherIds);
      const byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));
      setThreads([...map.entries()].map(([uid, msg]) => ({ uid, msg, profile: byId[uid] })));
    }
    load();
    const ch = supabase.channel("dm-list").on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    supabase.from("profiles").select("id,username").ilike("username", `%${query}%`).limit(8).then(({ data }) => setResults((data || []).filter((p) => p.id !== user?.id)));
  }, [query, user]);

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to chat with sellers and collectors.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-4">
        <h1 className="mb-4 text-2xl font-bold">Messages</h1>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a user..." className="w-full rounded-xl bg-input py-2 pl-9 pr-3 text-sm outline-none" />
        </div>
        {results.length > 0 && (
          <div className="mb-4 space-y-1 rounded-xl bg-card p-2">
            {results.map((p) => (
              <button key={p.id} onClick={() => nav({ to: "/messages/$userId", params: { userId: p.id } })} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">@{p.username}</button>
            ))}
          </div>
        )}

        {threads.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No conversations yet</p>}
        <div className="space-y-2">
          {threads.map((t) => (
            <Link key={t.uid} to="/messages/$userId" params={{ userId: t.uid }} className="flex items-center gap-3 rounded-xl bg-card p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20"><MessageCircle className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">@{t.profile?.username || "user"}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{t.msg.content}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
