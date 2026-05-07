import { Link, useLocation } from "@tanstack/react-router";
import { Home, Radio, Store, Lock, MessageCircle, Plus, User, Package, ShoppingBag } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpBubble } from "@/components/HelpBubble";
import logo from "@/assets/logo.png";

const baseTabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/market", label: "Market", icon: Store },
  { to: "/vault", label: "Vault", icon: Lock },
  { to: "/messages", label: "Chat", icon: MessageCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user } = useAuth();
  const [isSeller, setIsSeller] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (!user) { setIsSeller(false); setCartCount(0); return; }
    supabase.from("profiles").select("seller_status").eq("id", user.id).maybeSingle()
      .then(({ data }) => setIsSeller(data?.seller_status === "approved"));
    const refresh = () => supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id).eq("payment_status", "awaiting_payment")
      .then(({ count }) => setCartCount(count || 0));
    refresh();
    const ch = supabase.channel(`cart-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Cap at 5 tabs for one-handed mobile use. Sellers swap Market for Seller Hub.
  const tabs = isSeller
    ? [
        { to: "/", label: "Home", icon: Home },
        { to: "/live", label: "Live", icon: Radio },
        { to: "/store", label: "Hub", icon: Package },
        { to: "/vault", label: "Vault", icon: Lock },
        { to: "/profile", label: "Profile", icon: User },
      ]
    : [...baseTabs.slice(0, 4), { to: "/profile", label: "Profile", icon: User }];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      {/* Cleaner header: logo + 3 essential actions only */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PullBid Live" className="h-9 w-9 object-contain" />
          <div className="text-sm font-bold tracking-wide">PULL<span className="text-primary">BID</span></div>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/sell"
            className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm active:scale-95 transition-transform"
            data-tap
          >
            <Plus className="h-4 w-4" /> Sell
          </Link>
          <NotificationBell />
          <Link
            to="/cart"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-muted active:scale-95 transition-transform"
            data-tap
            aria-label="Cart"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Extra bottom padding so content clears the larger tab bar + safe area */}
      <main className="flex-1 pb-[calc(72px+env(safe-area-inset-bottom))]">{children}</main>

      <HelpBubble />

      {/* Bigger, breathable bottom nav — XL tap targets, safe-area padded */}
      <nav
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = loc.pathname === t.to || (t.to !== "/" && loc.pathname.startsWith(t.to));
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:scale-95 ${active ? "text-primary" : "text-muted-foreground"}`}
                data-tap
              >
                <Icon className={`h-6 w-6 ${active ? "scale-110" : ""} transition-transform`} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
