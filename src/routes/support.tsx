/**
 * /support — user-facing help center.
 * - Quick FAQ (collapsible)
 * - "Open a ticket" form (subject, category, priority, body)
 * - List of user's existing tickets with thread view + reply
 *
 * Writes to support_tickets / support_ticket_messages (RLS enforces ownership).
 * Staff (admin/moderator/support) reply via /admin SupportInbox.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, MessageCircle, Plus, Send, LifeBuoy } from "lucide-react";

export const Route = createFileRoute("/support")({ component: Support });

type Ticket = {
  id: string; subject: string; category: string; priority: string;
  status: string; created_at: string; updated_at: string;
};
type Msg = { id: string; body: string; is_staff: boolean; sender_id: string; created_at: string };

const FAQS = [
  { q: "How do I bid in a live auction?", a: "Open a Live stream and tap Bid. You'll need to be signed in and have a payment method on file." },
  { q: "When am I charged?", a: "Auction wins are auto-charged when the auction ends. Buy-it-now items charge at checkout." },
  { q: "How does shipping work?", a: "Sellers ship via Shippo labels. You'll get tracking when the order ships." },
  { q: "What if I don't pay a won auction?", a: "Unpaid wins reduce your trust score. After repeated misses, your bidding may be paused for 30 days." },
  { q: "How do I become a seller?", a: "Open Profile → Become a Seller, complete KYC, and connect Stripe to get paid." },
  { q: "How do I report someone?", a: "Tap the ⋯ menu on a profile, post, or stream → Report." },
];

const CATEGORIES = ["account", "payment", "shipping", "order", "stream", "report", "bug", "other"];
const PRIORITIES = ["normal", "high", "urgent"];

function Support() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showForm, setShowForm] = useState(false);
  const [active, setActive] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  // form state
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("account");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");

  async function loadTickets() {
    if (!user) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("id,subject,category,priority,status,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTickets((data as Ticket[]) || []);
  }

  useEffect(() => { loadTickets(); }, [user]);

  useEffect(() => {
    if (!active) { setMsgs([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", active.id)
        .order("created_at");
      if (!cancel) setMsgs((data as Msg[]) || []);
    })();
    const ch = supabase
      .channel(`support-${active.id}`)
      .on("postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${active.id}` } as any,
        (p: any) => setMsgs((prev) => [...prev, p.new as Msg]))
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [active]);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!subject.trim() || !body.trim()) return toast.error("Subject and message required");
    setBusy(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject, category, priority, status: "open" })
      .select()
      .single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    await supabase.from("support_ticket_messages").insert({
      ticket_id: data.id, sender_id: user.id, body, is_staff: false,
    });
    toast.success("Ticket sent — we'll get back to you soon");
    setShowForm(false);
    setSubject(""); setBody(""); setCategory("account"); setPriority("normal");
    loadTickets();
    setBusy(false);
  }

  async function sendReply() {
    if (!user || !active || !reply.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: active.id, sender_id: user.id, body: reply, is_staff: false,
    });
    if (error) toast.error(error.message);
    else { setReply(""); await supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", active.id); }
    setBusy(false);
  }

  if (!user) {
    return (
      <AppShell>
        <div className="px-4 py-12 text-center">
          <LifeBuoy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">Help & Support</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to open a support ticket or view your conversations.</p>
          <Link to="/auth" className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Sign in</Link>
          <div className="mx-auto mt-8 max-w-md text-left">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Quick FAQ</h2>
            <FaqList openFaq={openFaq} setOpenFaq={setOpenFaq} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-4">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-primary/15 via-accent/10 to-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/60">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight lg:text-3xl"><LifeBuoy className="h-5 w-5" /> Help & Support</h1>
            <p className="text-xs text-muted-foreground">Browse FAQs or open a ticket — we usually reply within 24h.</p>
          </div>
          <button
            onClick={() => { setShowForm((s) => !s); setActive(null); }}
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-[var(--shadow-primary)] active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" /> New ticket
          </button>
        </header>

        {showForm && (
          <form onSubmit={createTicket} className="mb-4 space-y-2 rounded-xl border border-border bg-card p-3">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject" className="w-full rounded-lg bg-input px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 rounded-lg bg-input px-2 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg bg-input px-2 py-2 text-sm">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} placeholder="Describe what's happening…" className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg bg-muted px-4 py-2 text-sm">Cancel</button>
            </div>
          </form>
        )}

        {active ? (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{active.subject}</p>
                <p className="text-[10px] text-muted-foreground">{active.category} · {active.priority} · {active.status}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto p-3">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.is_staff ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.is_staff ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                    {m.is_staff && <p className="mb-0.5 text-[10px] font-bold opacity-70">Support</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[9px] ${m.is_staff ? "text-muted-foreground" : "opacity-70"}`}>{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {msgs.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No messages yet</p>}
            </div>
            <div className="flex gap-2 border-t border-border p-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Type a reply…"
                className="flex-1 rounded-lg bg-input px-3 py-2 text-sm"
              />
              <button onClick={sendReply} disabled={busy || !reply.trim()} aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Your tickets</h2>
              {tickets.length === 0 ? (
                <p className="rounded-xl bg-card p-4 text-center text-xs text-muted-foreground">No tickets yet. Open one above if you need help.</p>
              ) : (
                <ul className="space-y-2">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => setActive(t)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-card p-3 text-left hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{t.subject}</p>
                          <p className="text-[10px] text-muted-foreground">{t.category} · {t.priority} · updated {new Date(t.updated_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          t.status === "open" ? "bg-primary/15 text-primary" :
                          t.status === "pending" ? "bg-amber-500/20 text-amber-500" :
                          t.status === "resolved" ? "bg-emerald-500/20 text-emerald-500" :
                          "bg-muted text-muted-foreground"
                        }`}>{t.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" /> Frequently asked
              </h2>
              <FaqList openFaq={openFaq} setOpenFaq={setOpenFaq} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function FaqList({ openFaq, setOpenFaq }: { openFaq: number | null; setOpenFaq: (n: number | null) => void }) {
  return (
    <div className="space-y-2">
      {FAQS.map((f, i) => {
        const open = openFaq === i;
        return (
          <div key={i} className="rounded-xl bg-card">
            <button
              onClick={() => setOpenFaq(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-semibold"
            >
              <span>{f.q}</span>
              {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
            {open && <p className="px-3 pb-3 text-sm text-muted-foreground">{f.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
