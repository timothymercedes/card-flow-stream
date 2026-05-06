import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { LifeBuoy, Send, AlertTriangle, CheckCircle2, RotateCcw, MessageSquare, ChevronLeft, Pause, Ban } from "lucide-react";

type Ticket = {
  id: string;
  user_id: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  status: "open" | "pending" | "resolved" | "closed" | string;
  subject: string;
  ai_conversation: any;
  order_id: string | null;
  stream_id: string | null;
  reported_user_id: string | null;
  attachments: string[] | null;
  created_at: string;
  updated_at: string;
  username?: string;
};

type Msg = {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500/20 text-orange-500",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-destructive/20 text-destructive",
  pending: "bg-yellow-500/20 text-yellow-500",
  resolved: "bg-primary/20 text-primary",
  closed: "bg-muted text-muted-foreground",
};

export function SupportInbox({ canModerate = true }: { canModerate?: boolean }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<"open" | "urgent" | "mine" | "all">("open");
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { toast.error(error.message); return; }
    const list = (data as Ticket[]) || [];
    const ids = Array.from(new Set(list.map((t) => t.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p.username]));
      list.forEach((t) => { t.username = map.get(t.user_id); });
    }
    setTickets(list);
  }

  useEffect(() => { loadTickets(); }, []);

  // Realtime: any insert/update on tickets refreshes list
  useEffect(() => {
    const ch = supabase
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Load messages when a ticket opens + subscribe
  useEffect(() => {
    if (!active) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", active.id)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((data as Msg[]) || []);
    })();
    const ch = supabase
      .channel(`admin-ticket-${active.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${active.id}` },
        (payload) => setMessages((m) => [...m, payload.new as Msg])
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [active?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, active?.id]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (filter === "open") return t.status === "open" || t.status === "pending";
      if (filter === "urgent") return t.priority === "urgent" || t.priority === "high";
      if (filter === "mine") return false; // Placeholder — could track assignment later
      return true;
    });
  }, [tickets, filter]);

  const counts = useMemo(() => ({
    open: tickets.filter((t) => t.status === "open" || t.status === "pending").length,
    urgent: tickets.filter((t) => t.priority === "urgent" || t.priority === "high").length,
    all: tickets.length,
  }), [tickets]);

  async function sendReply() {
    if (!reply.trim() || !active || !user) return;
    setSending(true);
    const body = reply.trim();
    setReply("");
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: active.id,
      sender_id: user.id,
      is_staff: true,
      body,
    });
    if (error) { toast.error(error.message); setReply(body); }
    else if (active.status === "open") {
      await supabase.from("support_tickets").update({ status: "pending" }).eq("id", active.id);
      setActive({ ...active, status: "pending" });
    }
    setSending(false);
  }

  async function setStatus(next: "open" | "resolved" | "closed") {
    if (!active) return;
    const { error } = await supabase.from("support_tickets").update({ status: next }).eq("id", active.id);
    if (error) return toast.error(error.message);
    toast.success(`Ticket ${next}`);
    setActive({ ...active, status: next });
    loadTickets();
  }

  async function quickSuspend(days: number) {
    if (!active || !active.username || !user) return;
    const reason = window.prompt(`Reason for ${days > 0 ? `${days}-day suspension` : "permanent ban"} of @${active.username}?`);
    if (!reason) return;
    const expires_at = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const { error } = await supabase.from("user_suspensions").insert({
      user_id: active.user_id, username: active.username,
      type: days > 0 ? "suspension" : "ban",
      reason, by_admin_id: user.id, expires_at, active: true,
    });
    if (error) return toast.error(error.message);
    toast.success(days > 0 ? `Suspended @${active.username}` : `Banned @${active.username}`);
  }

  // ----- mobile: list vs thread view -----
  const showThread = !!active;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[320px_1fr]">
      {/* List */}
      <div className={`${showThread ? "hidden md:block" : ""} space-y-2`}>
        <div className="flex flex-wrap gap-1.5">
          {([
            { k: "open", label: `Open (${counts.open})` },
            { k: "urgent", label: `Urgent (${counts.urgent})` },
            { k: "all", label: `All (${counts.all})` },
          ] as const).map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === f.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => setActive(t)}
              className={`w-full rounded-xl border border-border bg-card p-3 text-left transition hover:bg-muted/40 ${active?.id === t.id ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.normal}`}>{t.priority}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${STATUS_STYLE[t.status] || STATUS_STYLE.open}`}>{t.status}</span>
                <span className="ml-auto truncate text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
              <p className="mt-1 truncate text-xs font-bold">{t.subject}</p>
              <p className="truncate text-[11px] text-muted-foreground">@{t.username || t.user_id.slice(0, 8)} · {t.category}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-12 text-center text-xs text-muted-foreground">No tickets.</p>}
        </div>
      </div>

      {/* Thread */}
      <div className={`${!showThread ? "hidden md:flex" : "flex"} flex-col rounded-xl border border-border bg-card`}>
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-12 text-center text-xs text-muted-foreground">
            <div>
              <LifeBuoy className="mx-auto mb-2 h-6 w-6" />
              Select a ticket to view the conversation.
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 border-b border-border p-3">
              <button onClick={() => setActive(null)} className="md:hidden rounded-full p-1 hover:bg-muted" aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{active.subject}</p>
                <p className="text-[11px] text-muted-foreground">
                  @{active.username || active.user_id.slice(0, 8)} · {active.category} · {new Date(active.created_at).toLocaleString()}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${PRIORITY_STYLE[active.priority] || PRIORITY_STYLE.normal}`}>{active.priority}</span>
                  <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS_STYLE[active.status] || STATUS_STYLE.open}`}>{active.status}</span>
                  {active.order_id && <span className="rounded bg-muted px-1.5 py-0.5">Order {active.order_id.slice(0, 8)}</span>}
                  {active.stream_id && (
                    <Link to="/live/$id" params={{ id: active.stream_id }} target="_blank" className="rounded bg-muted px-1.5 py-0.5 text-primary">Stream {active.stream_id.slice(0, 8)} ↗</Link>
                  )}
                  {active.reported_user_id && <span className="rounded bg-muted px-1.5 py-0.5">Reported user: {active.reported_user_id.slice(0, 8)}</span>}
                </div>
              </div>
            </div>

            {/* Body: AI history + messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 max-h-[55vh]">
              {Array.isArray(active.ai_conversation) && active.ai_conversation.length > 0 && (
                <details className="rounded-lg border border-border bg-muted/20 p-2 text-[11px]">
                  <summary className="cursor-pointer font-bold text-muted-foreground">
                    <MessageSquare className="mr-1 inline h-3 w-3" />
                    AI conversation history ({active.ai_conversation.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {active.ai_conversation.map((m: any, i: number) => (
                      <div key={i} className={m.role === "user" ? "text-foreground" : "text-muted-foreground"}>
                        <strong>{m.role}:</strong> {m.content}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {active.attachments && active.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {active.attachments.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="rounded border border-border p-1">
                      <img src={url} alt={`attachment-${i}`} className="h-20 w-20 rounded object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.is_staff ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.is_staff ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-0.5 text-[9px] ${m.is_staff ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {m.is_staff ? "Staff" : `@${active.username || "user"}`} · {new Date(m.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="py-6 text-center text-[11px] text-muted-foreground">No messages yet — send the first reply.</p>
              )}
            </div>

            {/* Actions bar */}
            <div className="border-t border-border p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {active.status !== "resolved" && (
                  <button onClick={() => setStatus("resolved")} className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary">
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </button>
                )}
                {active.status !== "closed" && (
                  <button onClick={() => setStatus("closed")} className="rounded-lg bg-muted px-2.5 py-1 text-[10px] font-bold">Close</button>
                )}
                {active.status !== "open" && (
                  <button onClick={() => setStatus("open")} className="inline-flex items-center gap-1 rounded-lg bg-yellow-500/20 px-2.5 py-1 text-[10px] font-bold text-yellow-500">
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </button>
                )}
                {canModerate && active.username && (
                  <>
                    <span className="ml-auto" />
                    <button onClick={() => quickSuspend(1)} className="inline-flex items-center gap-1 rounded-lg bg-yellow-500/20 px-2.5 py-1 text-[10px] font-bold text-yellow-500">
                      <Pause className="h-3 w-3" /> Suspend 1d
                    </button>
                    <button onClick={() => quickSuspend(7)} className="inline-flex items-center gap-1 rounded-lg bg-orange-500/20 px-2.5 py-1 text-[10px] font-bold text-orange-500">
                      <Pause className="h-3 w-3" /> Suspend 7d
                    </button>
                    <button onClick={() => quickSuspend(0)} className="inline-flex items-center gap-1 rounded-lg bg-destructive/20 px-2.5 py-1 text-[10px] font-bold text-destructive">
                      <Ban className="h-3 w-3" /> Ban
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                  placeholder="Reply to user… (⌘/Ctrl+Enter to send)"
                  rows={2}
                  className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none" />
                <button onClick={sendReply} disabled={!reply.trim() || sending}
                  className="inline-flex items-center gap-1 self-end rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
              </div>
              {(active.priority === "urgent" || active.priority === "high") && (
                <p className="flex items-center gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Urgent ticket — prioritize response.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
