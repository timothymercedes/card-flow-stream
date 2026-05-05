import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X, Send, Play, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import tourWelcome from "@/assets/tour-welcome.png";
import tourLive from "@/assets/tour-live.png";
import tourMarket from "@/assets/tour-market.png";
import tourSell from "@/assets/tour-sell.png";
import tourVault from "@/assets/tour-vault.png";
import tourHelp from "@/assets/tour-help.png";

type Msg = { role: "user" | "assistant"; content: string };

const TOUR_STEPS = [
  { img: tourWelcome, title: "Welcome to PullBid Live 👋", body: "The fastest way to buy, sell & trade cards live. Here's a 60-second tour." },
  { img: tourLive, title: "🔴 Watch & Bid Live", body: "Tap the Live tab to join sellers running real-time auctions. Bid with one tap — highest bid wins when the timer ends." },
  { img: tourMarket, title: "🛒 Shop the Market", body: "Browse Buy Now listings, place bids on auctions, or send custom offers from the Market tab." },
  { img: tourSell, title: "📸 Sell Your Cards", body: "Hit the Sell button. Scan a card with your camera — AI identifies it and prices it for you." },
  { img: tourVault, title: "🔒 Track in your Vault", body: "Every card you scan or buy goes in your Vault with live market value." },
  { img: tourHelp, title: "💬 Need help anytime?", body: "Tap this floating chat bubble to ask the AI assistant or replay this tour." },
];

const LS_KEY = "pbl_tour_seen";

export function HelpBubble() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "chat" | "tour">("menu");
  const [tourStep, setTourStep] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your PullBid assistant. Ask me anything — how to go live, list a card, bid, ship, etc." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-show tour on first visit
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(LS_KEY)) {
      setOpen(true);
      setMode("tour");
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mode]);

  function dismissTour(dontShowAgain: boolean) {
    if (dontShowAgain && typeof window !== "undefined") localStorage.setItem(LS_KEY, "1");
    setMode("menu");
    setOpen(false);
    setTourStep(0);
  }

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

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMode("menu"); }}
          aria-label="Help"
          className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl ring-2 ring-primary/30 transition hover:scale-105"
        >
          <MessageCircleQuestion className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-4 z-40 flex h-[520px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              {mode === "chat" ? "AI Help" : mode === "tour" ? "App Tour" : "How can we help?"}
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === "menu" && (
            <div className="flex flex-1 flex-col gap-2 p-3">
              <button onClick={() => setMode("chat")} className="flex items-center gap-3 rounded-xl bg-primary/10 p-3 text-left text-sm hover:bg-primary/15">
                <MessageCircleQuestion className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Ask the AI assistant</p>
                  <p className="text-[11px] text-muted-foreground">Get instant answers about the app</p>
                </div>
              </button>
              <button onClick={() => { setTourStep(0); setMode("tour"); }} className="flex items-center gap-3 rounded-xl bg-accent/10 p-3 text-left text-sm hover:bg-accent/15">
                <Play className="h-5 w-5 text-accent" />
                <div>
                  <p className="font-semibold">Replay the app tour</p>
                  <p className="text-[11px] text-muted-foreground">60-second walkthrough</p>
                </div>
              </button>
              <p className="mt-auto text-center text-[10px] text-muted-foreground">Powered by Lovable AI</p>
            </div>
          )}

          {mode === "tour" && (
            <div className="flex flex-1 flex-col p-4">
              <div className="mb-3 flex gap-1">
                {TOUR_STEPS.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= tourStep ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <div className="flex flex-1 flex-col items-center text-center">
                <div className="mb-2 flex h-40 w-40 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-accent/10 to-live/15">
                  <img src={TOUR_STEPS[tourStep].img} alt="" loading="lazy" width={160} height={160} className="h-36 w-36 object-contain drop-shadow-lg" />
                </div>
                <h3 className="text-lg font-bold">{TOUR_STEPS[tourStep].title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{TOUR_STEPS[tourStep].body}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => setTourStep((s) => Math.max(0, s - 1))}
                  disabled={tourStep === 0}
                  className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                {tourStep < TOUR_STEPS.length - 1 ? (
                  <button
                    onClick={() => setTourStep((s) => s + 1)}
                    className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => dismissTour(true)}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                  >
                    Got it 🎉
                  </button>
                )}
              </div>
              <button onClick={() => dismissTour(true)} className="mt-2 text-center text-[10px] text-muted-foreground underline">
                Don't show this again
              </button>
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
