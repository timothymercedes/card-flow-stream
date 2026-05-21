import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { MessageCircle, Search, Inbox, Check, X as XIcon, PenSquare } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeChannel } from "@/lib/realtime";

export const Route = createFileRoute("/messages/")({ component: Messages });

function Messages() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [threads, setThreads] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTarget, setComposeTarget] = useState<{ id: string; username: string } | null>(null);
  const [composeMsg, setComposeMsg] = useState("");

  async function load() {
    if (!user) return;
    // Accepted pairs only
    const { data: accepted } = await supabase.from("message_requests").select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).eq("status", "accepted");
    const acceptedPairs = new Set((accepted || []).map((r) => [r.sender_id, r.recipient_id].sort().join("-")));

    const { data } = await supabase.from("direct_messages").select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    const map = new Map<string, any>();
    for (const m of data || []) {
      const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const key = [m.sender_id, m.recipient_id].sort().join("-");
      if (!acceptedPairs.has(key)) continue;
      if (!map.has(other)) map.set(other, m);
    }
    const otherIds = [...map.keys()];
    if (otherIds.length) {
      const { data: profs } = await (supabase.rpc as any)("public_profiles_by_ids", { _ids: otherIds });
      const byId = Object.fromEntries((profs || []).map((p: any) => [p.id, p]));
      setThreads([...map.entries()].map(([uid, msg]) => ({ uid, msg, profile: byId[uid] })));
    } else setThreads([]);

    const { data: reqs } = await supabase.from("message_requests").select("*")
      .eq("recipient_id", user.id).eq("status", "pending").order("last_request_at", { ascending: false });
    setRequests(reqs || []);
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);
  useRealtimeChannel({ name: `dm-list-${user?.id ?? "anon"}`, enabled: !!user }, (ch) => ch
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "direct_messages" } as any, () => load())
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "message_requests" } as any, () => load()));

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    (supabase.rpc as any)("search_public_profiles", { _query: query, _limit: 8 })
      .then(({ data }: any) => setResults(((data || []) as any[]).filter((p) => p.id !== user?.id)));
  }, [query, user]);

  async function sendRequest(otherId: string, otherName: string, message?: string) {
    if (!user || !profile) return;
    const msg = (message || "").trim() || null;
    // Check if pair already exists
    const { data: existing } = await supabase.from("message_requests").select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`)
      .maybeSingle();
    if (existing) {
      if (existing.status === "accepted") { nav({ to: "/messages/$userId", params: { userId: otherId } }); return; }
      if (existing.status === "pending") {
        if (existing.sender_id === user.id) {
          const last = new Date(existing.last_request_at).getTime();
          if (Date.now() - last < 24 * 60 * 60 * 1000) return toast.error("Request already pending — try again later");
          await supabase.from("message_requests").update({ last_request_at: new Date().toISOString(), ...(msg ? { request_message: msg } as any : {}) }).eq("id", existing.id);
          return toast.success("Request resent");
        } else {
          return toast.message("They already sent you a request — check Requests tab");
        }
      }
      if (existing.status === "declined") return toast.error("Request was declined");
    }
    const { error } = await supabase.from("message_requests").insert({
      sender_id: user.id, sender_username: profile.username, recipient_id: otherId,
      ...(msg ? { request_message: msg } as any : {}),
    } as any);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: otherId, type: "msg_request",
      body: msg ? `@${profile.username}: ${msg.slice(0, 80)}` : `@${profile.username} wants to message you`,
      link: `/messages`,
    });
    toast.success("Request sent");
    setQuery(""); setResults([]); setComposeMsg(""); setComposeTarget(null);
  }

  async function respondRequest(req: any, accept: boolean) {
    const { error } = await supabase.from("message_requests").update({ status: accept ? "accepted" : "declined" }).eq("id", req.id);
    if (error) return toast.error(error.message);
    await supabase.from("notifications").insert({
      user_id: req.sender_id, type: "msg_request", body: accept ? `@${profile?.username} accepted your message request` : `@${profile?.username} declined your message request`, link: `/messages`,
    });
    if (accept) nav({ to: "/messages/$userId", params: { userId: req.sender_id } });
    else load();
  }

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
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Messages</h1>
            <p className="text-xs text-muted-foreground">{threads.length} chat{threads.length !== 1 ? "s" : ""} · {requests.length} request{requests.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => { setComposeOpen(true); setQuery(""); setResults([]); }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-primary)] transition active:scale-[0.98]"
          >
            <PenSquare className="h-3.5 w-3.5" /> Compose
          </button>
        </div>
        <div className="sticky top-0 z-20 -mx-4 mb-3 flex gap-1 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <button onClick={() => setTab("chats")} className={`flex-1 rounded-full py-1.5 text-sm font-bold transition ${tab === "chats" ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 text-muted-foreground ring-1 ring-border/60 hover:bg-card hover:text-foreground"}`}>Chats</button>
          <button onClick={() => setTab("requests")} className={`flex-1 rounded-full py-1.5 text-sm font-bold transition ${tab === "requests" ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 text-muted-foreground ring-1 ring-border/60 hover:bg-card hover:text-foreground"}`}>
            Requests {requests.length > 0 && <span className="ml-1 rounded-full bg-live px-1.5 text-[10px] text-live-foreground">{requests.length}</span>}
          </button>
        </div>



        {tab === "chats" ? (
          <>
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
          </>
        ) : (
          <>
            {requests.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-2 h-6 w-6" />No pending requests</p>}
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-xl bg-card p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20"><MessageCircle className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">@{r.sender_username}</p>
                    {r.request_message && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">"{r.request_message}"</p>}
                  </div>
                  <button onClick={() => respondRequest(r, true)} className="rounded-full bg-primary p-2 text-primary-foreground"><Check className="h-4 w-4" /></button>
                  <button onClick={() => respondRequest(r, false)} className="rounded-full bg-muted p-2"><XIcon className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => { setComposeOpen(false); setComposeTarget(null); setComposeMsg(""); }}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold">{composeTarget ? `Message @${composeTarget.username}` : "New message"}</p>
              <button onClick={() => { setComposeOpen(false); setComposeTarget(null); setComposeMsg(""); }}><XIcon className="h-4 w-4" /></button>
            </div>
            {!composeTarget ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by username..."
                    className="w-full rounded-xl bg-input py-2 pl-9 pr-3 text-sm outline-none"
                  />
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {query.trim() && results.length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">No users found</p>
                  )}
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setComposeTarget({ id: p.id, username: p.username })}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>@{p.username}</span>
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">Select</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Add an optional intro so they know who you are. They'll see this with your request.</p>
                <textarea
                  autoFocus
                  value={composeMsg}
                  onChange={(e) => setComposeMsg(e.target.value.slice(0, 280))}
                  placeholder="Hey! Saw your stream — wanted to chat about that Charizard…"
                  rows={4}
                  className="w-full resize-none rounded-xl bg-input p-3 text-sm outline-none"
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <button onClick={() => setComposeTarget(null)} className="rounded-full bg-muted px-3 py-1 font-bold">← Back</button>
                  <span>{composeMsg.length}/280</span>
                </div>
                <button
                  onClick={async () => {
                    await sendRequest(composeTarget.id, composeTarget.username, composeMsg);
                    setComposeOpen(false);
                  }}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
                >
                  Send request
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

