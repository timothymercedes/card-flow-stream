import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X, Send, Sparkles, Play, Shield, ShieldAlert, Flag, Inbox, ChevronLeft, AlertTriangle, LifeBuoy, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/components/MascotGuide";
import { MASCOTS, TOURS } from "@/lib/tours";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type Escalation = { suggested: boolean; category?: TicketCategory; reason?: string; priority?: "low" | "normal" | "high" | "urgent" };
type TicketCategory =
  | "moderator" | "admin" | "scam" | "harassment" | "payment"
  | "livestream" | "account" | "ban_appeal" | "report_user" | "report_stream" | "other";

type Ticket = {
  id: string;
  category: TicketCategory;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
};
type TicketMessage = { id: string; sender_id: string; body: string; is_staff: boolean; created_at: string };

const FIRST_VISIT_KEY = "pbl_first_visit_seen";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  moderator: "Message a Moderator",
  admin: "Contact Admin",
  scam: "Scam / Fraud",
  harassment: "Harassment",
  payment: "Payment Dispute",
  livestream: "Livestream Issue",
  account: "Account Issue",
  ban_appeal: "Ban Appeal",
  report_user: "Report a User",
  report_stream: "Report a Stream",
  other: "Other",
};

type Mode = "menu" | "chat" | "escalate" | "tickets" | "ticket";

export function HelpBubble() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your PullBid assistant. Ask me anything — bidding, shipping, payouts, going live, account help. If something needs a human, I'll route you to a mod or admin." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [escalation, setEscalation] = useState<Escalation>({ suggested: false });
  const [escCategory, setEscCategory] = useState<TicketCategory>("moderator");
  const [escSubject, setEscSubject] = useState("");
  const [escDetails, setEscDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [ticketMsgs, setTicketMsgs] = useState<TicketMessage[]>([]);
  const [ticketReply, setTicketReply] = useState("");
  const [me, setMe] = useState<{ id: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startTour, triggerOnce, resetAllSeen } = useTour();
  const { profile } = useAuth();
  const isSeller = !!profile?.is_seller;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user ? { id: data.user.id } : null));
  }, []);

  // Auto-fire welcome tour once per user — buyer or seller, never both.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      localStorage.setItem(FIRST_VISIT_KEY, "1");
      const tourId = isSeller ? "seller-welcome" : "buyer-welcome";
      const t = setTimeout(() => triggerOnce(tourId), 800);
      return () => clearTimeout(t);
    }
  }, [triggerOnce, isSeller]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode, ticketMsgs]);

  // Load my tickets when entering tickets view
  useEffect(() => {
    if (mode !== "tickets" || !me) return;
    supabase.from("support_tickets")
      .select("id, category, subject, status, priority, created_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setTickets((data as Ticket[]) || []));
  }, [mode, me]);

  // Realtime updates for an open ticket
  useEffect(() => {
    if (mode !== "ticket" || !activeTicket) return;
    let cancel = false;
    supabase.from("support_ticket_messages")
      .select("*").eq("ticket_id", activeTicket.id).order("created_at")
      .then(({ data }) => { if (!cancel) setTicketMsgs((data as TicketMessage[]) || []); });
    const ch = supabase.channel(`ticket-${activeTicket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${activeTicket.id}` },
        (p) => setTicketMsgs((m) => [...m, p.new as TicketMessage]))
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [mode, activeTicket]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("help-chat", { body: { messages: next } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply = (data as any)?.reply || "...";
      const esc = (data as any)?.escalate as Escalation | undefined;
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (esc?.suggested) setEscalation(esc);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "Something went wrong"}` }]);
    } finally {
      setSending(false);
    }
  }

  function openEscalation(category: TicketCategory, subject = "") {
    if (!me) {
      toast.error("Sign in to contact support");
      return;
    }
    setEscCategory(category);
    setEscSubject(subject || CATEGORY_LABELS[category]);
    setEscDetails("");
    setMode("escalate");
  }

  async function submitTicket() {
    if (!me) return toast.error("Sign in first");
    if (!escSubject.trim()) return toast.error("Add a subject");
    if (!escDetails.trim()) return toast.error("Add some details");
    setSubmitting(true);
    const priority: Ticket["priority"] =
      escCategory === "harassment" || escCategory === "livestream" ? "urgent"
      : escCategory === "scam" || escCategory === "payment" || escCategory === "account" || escCategory === "report_stream" ? "high"
      : "normal";
    const { data, error } = await supabase.from("support_tickets").insert({
      user_id: me.id,
      category: escCategory,
      subject: escSubject.slice(0, 200),
      priority,
      ai_conversation: messages,
    }).select().single();
    if (error) { setSubmitting(false); return toast.error(error.message); }
    // Initial message from the user
    await supabase.from("support_ticket_messages").insert({
      ticket_id: (data as any).id, sender_id: me.id, body: escDetails, is_staff: false,
    });
    setSubmitting(false);
    toast.success("Support ticket created — we'll reply soon");
    setActiveTicket(data as Ticket);
    setMode("ticket");
    setEscalation({ suggested: false });
  }

  async function sendTicketReply() {
    if (!me || !activeTicket || !ticketReply.trim()) return;
    const body = ticketReply.trim();
    setTicketReply("");
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: activeTicket.id, sender_id: me.id, body, is_staff: false,
    });
    if (error) toast.error(error.message);
  }

  // Replay menu — filtered by audience so buyers don't see seller tours and vice versa.
  const allGuides = [
    { id: "buyer-welcome",       mascotId: "buyer"  as const, title: "Buyer guide",        desc: "Bid, buy, ship, follow.",        forSeller: false },
    { id: "auction-live-screen", mascotId: "buyer"  as const, title: "Live auction guide", desc: "Bidding, snipes, timers.",       forSeller: false },
    { id: "seller-welcome",      mascotId: "seller" as const, title: "Seller guide",       desc: "Live, OBS, shipping, payouts.",  forSeller: true  },
    { id: "seller-first-stream", mascotId: "seller" as const, title: "First stream walkthrough", desc: "Scan, auction controls, voice.", forSeller: true  },
    { id: "obs-connect",         mascotId: "seller" as const, title: "OBS setup guide",    desc: "Stream key, RTMPS, encode.",     forSeller: true  },
    { id: "flex-welcome",        mascotId: "flex"   as const, title: "Flex Live guide",    desc: "Collabs, safety, social.",       forSeller: true  },
    { id: "flex-live-screen",    mascotId: "flex"   as const, title: "Flex room tour",     desc: "Reactions, collab tab.",         forSeller: false },
  ];
  const guides = allGuides.filter((g) => isSeller ? g.forSeller : !g.forSeller);

  const escalateButtons: { cat: TicketCategory; label: string; icon: any; tone: string }[] = [
    { cat: "moderator", label: "Message Moderator", icon: Shield, tone: "bg-emerald-600/15 text-emerald-300 border-emerald-500/30" },
    { cat: "admin", label: "Contact Admin", icon: ShieldAlert, tone: "bg-blue-600/15 text-blue-300 border-blue-500/30" },
    { cat: "report_user", label: "Report a User", icon: Flag, tone: "bg-orange-600/15 text-orange-300 border-orange-500/30" },
    { cat: "report_stream", label: "Report a Stream", icon: AlertTriangle, tone: "bg-red-600/15 text-red-300 border-red-500/30" },
  ];

  return (
    <>
      {!open && (
        <button
          onClick={() => { setOpen(true); setMode("menu"); }}
          aria-label="Help"
          className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-2 ring-primary/30 transition hover:scale-105"
        >
          <MessageCircleQuestion className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-24 right-4 z-40 flex h-[560px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-bold">
              {mode !== "menu" && (
                <button onClick={() => setMode(mode === "ticket" ? "tickets" : "menu")} className="rounded-full p-1 hover:bg-muted">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <Sparkles className="h-4 w-4 text-primary" />
              {mode === "chat" && "AI Help"}
              {mode === "menu" && "Support"}
              {mode === "escalate" && "Contact Human"}
              {mode === "tickets" && "My Tickets"}
              {mode === "ticket" && (activeTicket?.subject || "Ticket")}
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* MENU */}
          {mode === "menu" && (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
              <button onClick={() => setMode("chat")} className="flex items-center gap-3 rounded-xl bg-primary/10 p-3 text-left text-sm hover:bg-primary/15">
                <MessageCircleQuestion className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Ask the AI assistant</p>
                  <p className="text-[11px] text-muted-foreground">Bidding, shipping, going live, payouts…</p>
                </div>
              </button>

              <div className="mt-1 grid grid-cols-2 gap-2">
                {escalateButtons.map((b) => (
                  <button key={b.cat} onClick={() => openEscalation(b.cat)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left text-xs ${b.tone}`}>
                    <b.icon className="h-4 w-4" />
                    <span className="font-semibold leading-tight">{b.label}</span>
                  </button>
                ))}
              </div>

              <button onClick={() => setMode("tickets")} className="flex items-center gap-3 rounded-xl bg-muted/50 p-2.5 text-left text-sm hover:bg-muted">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">My support tickets</span>
              </button>

              <div className="mt-2 border-t border-border pt-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">App tours</p>
                {guides.map((g) => {
                  const m = MASCOTS[g.mascotId];
                  return (
                    <button key={g.id} onClick={() => { setOpen(false); startTour(g.id as keyof typeof TOURS, true); }}
                      className={`mb-1.5 flex w-full items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${m.glow} p-2 text-left text-sm transition hover:scale-[1.01]`}>
                      <img src={m.image} alt={m.name} width={36} height={36} loading="lazy" className="h-9 w-9 flex-shrink-0 rounded-lg bg-background/40 object-contain" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{g.title}</p>
                        <p className="truncate text-[10px] text-white/70">{g.desc}</p>
                      </div>
                      <Play className="h-3.5 w-3.5 flex-shrink-0 text-white" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CHAT */}
          {mode === "chat" && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && <div className="text-[10px] text-muted-foreground">Thinking…</div>}

                {/* Smart escalation card */}
                {escalation.suggested && escalation.category && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <LifeBuoy className="h-3.5 w-3.5" />
                      Looks like you need a human
                    </div>
                    <p className="mt-1 text-muted-foreground">{escalation.reason || "We'll route this to the right team."}</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => openEscalation(escalation.category!, CATEGORY_LABELS[escalation.category!])}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-black">
                        Open ticket → {CATEGORY_LABELS[escalation.category]}
                      </button>
                      <button onClick={() => setEscalation({ suggested: false })}
                        className="rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted">
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask anything…"
                  className="flex-1 rounded-full bg-input px-3 py-2 text-xs outline-none" />
                <button onClick={send} disabled={sending || !input.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {/* ESCALATE FORM */}
          {mode === "escalate" && (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
              <select value={escCategory} onChange={(e) => setEscCategory(e.target.value as TicketCategory)}
                className="rounded-lg bg-input px-3 py-2 text-xs">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <label className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</label>
              <input value={escSubject} onChange={(e) => setEscSubject(e.target.value)} maxLength={200}
                placeholder="Short summary" className="rounded-lg bg-input px-3 py-2 text-xs" />
              <label className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What happened?</label>
              <textarea value={escDetails} onChange={(e) => setEscDetails(e.target.value)} rows={6}
                placeholder="Include usernames, stream/order links, dates if you have them."
                className="resize-none rounded-lg bg-input px-3 py-2 text-xs" />
              <p className="text-[10px] text-muted-foreground">Your AI chat history is automatically attached to help our team.</p>
              <button onClick={submitTicket} disabled={submitting}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {submitting ? "Sending…" : "Submit ticket"}
              </button>
            </div>
          )}

          {/* TICKET LIST */}
          {mode === "tickets" && (
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
              {tickets.length === 0 && <p className="text-center text-xs text-muted-foreground">No tickets yet.</p>}
              {tickets.map((t) => (
                <button key={t.id} onClick={() => { setActiveTicket(t); setMode("ticket"); }}
                  className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted/40 p-2.5 text-left hover:bg-muted">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-bold">{t.subject}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      t.status === "open" ? "bg-emerald-500/20 text-emerald-300"
                      : t.status === "in_progress" ? "bg-blue-500/20 text-blue-300"
                      : "bg-muted text-muted-foreground"
                    }`}>{t.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{CATEGORY_LABELS[t.category]}</span>
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* TICKET CONVERSATION */}
          {mode === "ticket" && activeTicket && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                <div className="rounded-lg bg-muted/40 p-2 text-[10px] text-muted-foreground">
                  <span className="font-semibold uppercase">{CATEGORY_LABELS[activeTicket.category]}</span> · priority {activeTicket.priority} · {activeTicket.status}
                </div>
                {ticketMsgs.map((m) => (
                  <div key={m.id} className={`flex ${m.is_staff ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${
                      m.is_staff ? "bg-emerald-500/15 text-emerald-100 border border-emerald-500/30" : "bg-primary text-primary-foreground"
                    }`}>
                      {m.is_staff && <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider opacity-70">Staff</div>}
                      {m.body}
                    </div>
                  </div>
                ))}
                {ticketMsgs.length === 0 && <p className="text-center text-[11px] text-muted-foreground">A team member will reply soon.</p>}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2">
                <input value={ticketReply} onChange={(e) => setTicketReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendTicketReply()}
                  placeholder="Reply…"
                  className="flex-1 rounded-full bg-input px-3 py-2 text-xs outline-none" />
                <button onClick={sendTicketReply} disabled={!ticketReply.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Helper exported for live-stream "quick report" buttons. Pre-fills a ticket
 * for fast reporting from inside a stream.
 */
export async function quickReportStream(streamId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) { toast.error("Sign in to report"); return; }
  const { error } = await supabase.from("support_tickets").insert({
    user_id: u.user.id,
    category: "report_stream",
    subject: `Report stream: ${reason.slice(0, 60)}`,
    priority: "urgent",
    stream_id: streamId,
    ai_conversation: [{ role: "user", content: reason }],
  });
  if (error) toast.error(error.message);
  else toast.success("Reported — moderators notified");
}
