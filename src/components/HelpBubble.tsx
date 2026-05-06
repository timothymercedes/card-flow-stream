import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X, Send, Sparkles, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/components/MascotGuide";
import { MASCOTS, TOURS } from "@/lib/tours";

type Msg = { role: "user" | "assistant"; content: string };

const FIRST_VISIT_KEY = "pbl_first_visit_seen";

export function HelpBubble() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "chat">("menu");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your PullBid assistant. Ask me anything — how to go live, list a card, bid, ship, etc." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startTour, triggerOnce } = useTour();

  // Fire the buyer-welcome mascot tour on first visit (once ever).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(FIRST_VISIT_KEY)) {
      localStorage.setItem(FIRST_VISIT_KEY, "1");
      // small delay so it lands after first paint
      const t = setTimeout(() => triggerOnce("buyer-welcome"), 800);
      return () => clearTimeout(t);
    }
  }, [triggerOnce]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode]);

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
      setMessages((m) => [...m, { role: "assistant", content: (data as any)?.reply || "..." }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "Something went wrong"}` }]);
    } finally {
      setSending(false);
    }
  }

  const guides = [
    { id: "buyer-welcome", mascotId: "buyer" as const, title: "Buyer guide", desc: "Bid, buy, ship, follow — the basics." },
    { id: "seller-welcome", mascotId: "seller" as const, title: "Seller guide", desc: "Going live, OBS, shipping, payouts." },
    { id: "flex-welcome", mascotId: "flex" as const, title: "Flex Live guide", desc: "Collabs, safety, social streaming." },
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
        <div className="fixed bottom-24 right-4 z-40 flex h-[520px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              {mode === "chat" ? "AI Help" : "Meet your guides"}
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === "menu" && (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
              {guides.map((g) => {
                const m = MASCOTS[g.mascotId];
                return (
                  <button
                    key={g.id}
                    onClick={() => { setOpen(false); startTour(g.id as keyof typeof TOURS, true); }}
                    className={`flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${m.glow} p-2.5 text-left text-sm transition hover:scale-[1.02]`}
                  >
                    <img src={m.image} alt={m.name} width={48} height={48} loading="lazy" className="h-12 w-12 flex-shrink-0 rounded-xl bg-background/40 object-contain" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-white/80">{m.name}</p>
                      <p className="truncate font-semibold text-white">{g.title}</p>
                      <p className="truncate text-[10px] text-white/70">{g.desc}</p>
                    </div>
                    <Play className="h-4 w-4 flex-shrink-0 text-white" />
                  </button>
                );
              })}

              <button onClick={() => setMode("chat")} className="mt-1 flex items-center gap-3 rounded-xl bg-primary/10 p-3 text-left text-sm hover:bg-primary/15">
                <MessageCircleQuestion className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Ask the AI assistant</p>
                  <p className="text-[11px] text-muted-foreground">Get instant answers about the app</p>
                </div>
              </button>
              <p className="mt-auto text-center text-[10px] text-muted-foreground">Powered by Lovable AI</p>
            </div>
          )}

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
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask anything…"
                  className="flex-1 rounded-full bg-input px-3 py-2 text-xs outline-none"
                />
                <button onClick={send} disabled={sending || !input.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
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
