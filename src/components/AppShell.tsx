import { Link, useLocation } from "@tanstack/react-router";
import { Home, Radio, Store, Lock, MessageCircle, Plus, User, Package, ShoppingBag, Newspaper, Sparkles, Search } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { AdminAlertBadge } from "@/components/AdminAlertBadge";
import { HelpBubble } from "@/components/HelpBubble";
import { useTutorialMode } from "@/lib/tutorialMode";
import { useRealtimeChannel } from "@/lib/realtime";
import logo from "@/assets/logo.png";

const baseTabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/feed", label: "Feed", icon: Newspaper },
  { to: "/market", label: "Market", icon: Store },
  { to: "/vault", label: "Vault", icon: Lock },
  { to: "/messages", label: "Chat", icon: MessageCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user } = useAuth();
  const tutorial = useTutorialMode();
  const [isSeller, setIsSeller] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (tutorial) { setIsSeller(true); setCartCount(2); return; }
    if (!user) { setIsSeller(false); setCartCount(0); return; }
    supabase.from("profiles").select("seller_status").eq("id", user.id).maybeSingle()
      .then(({ data }) => setIsSeller(data?.seller_status === "approved"));
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tutorial]);

  function refreshCart() {
    if (!user) return;
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id).eq("payment_status", "awaiting_payment")
      .then(({ count }) => setCartCount(count || 0));
  }

  useRealtimeChannel(
    { name: `cart-${user?.id ?? "none"}`, enabled: !!user && !tutorial },
    (ch) => ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user?.id ?? ""}` },
      () => refreshCart(),
    ),
  );

  const tabs = [
    ...baseTabs,
    ...(isSeller ? [{ to: "/store", label: "Seller Hub", icon: Package }] : []),
    { to: "/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
       <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PullBid Live" className="h-10 w-10 object-contain" />
          <div className="text-sm font-bold tracking-wide">PULL<span className="text-primary">BID</span> <span className="text-live">LIVE</span></div>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link to="/showoff" className="flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5" /> Flex Live
          </Link>
          <Link to="/sell" className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Sell
          </Link>
          {!tutorial && <AdminAlertBadge />}
          {!tutorial && <NotificationBell />}
          <Link to="/cart" className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
                {cartCount}
              </span>
            )}
          </Link>
          <Link to="/profile" className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            <User className="h-4 w-4" />
          </Link>
        </div>
       </div>
       <HeaderSearch />
      </header>
      <main className="flex-1 pb-20">{children}</main>
      {!tutorial && <HelpBubble />}
      {!tutorial && <NotifyPrompt />}
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur">
        <div className={`grid`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = loc.pathname === t.to || (t.to !== "/" && loc.pathname.startsWith(t.to));
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
