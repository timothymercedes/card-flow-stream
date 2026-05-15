import { Link, useLocation } from "@tanstack/react-router";
import { Home, Radio, Store, Lock, MessageCircle, Plus, User, Package, ShoppingBag, Newspaper, Sparkles, Bookmark } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "@/components/HeaderSearch";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { AdminAlertBadge } from "@/components/AdminAlertBadge";
import { AdminAlertBanner } from "@/components/AdminAlertBanner";
import { AccountHoldBanner } from "@/components/AccountHoldBanner";
import { HelpBubble } from "@/components/HelpBubble";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ReturnToLiveBadge } from "@/components/ReturnToLiveBadge";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { SellMenu } from "@/components/SellMenu";
import { XPBadge } from "@/components/XPBadge";
import { DailyLoginRewardModal } from "@/components/DailyLoginRewardModal";
import { AchievementToastListener, LevelUpListener } from "@/components/AchievementToastListener";
import { useTutorialMode } from "@/lib/tutorialMode";
import { useRealtimeChannel } from "@/lib/realtime";
import logo from "@/assets/logo.png";

const baseTabs = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/live", labelKey: "nav.live", icon: Radio },
  { to: "/feed", labelKey: "nav.feed", icon: Newspaper },
  { to: "/market", labelKey: "nav.market", icon: Store },
  { to: "/vault", labelKey: "nav.vault", icon: Lock },
  { to: "/messages", labelKey: "nav.chat", icon: MessageCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user } = useAuth();
  const tutorial = useTutorialMode();
  const { t } = useTranslation();
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
    ...(isSeller ? [{ to: "/store", labelKey: "nav.sellerHub", icon: Package }] : []),
    { to: "/profile", labelKey: "nav.profile", icon: User },
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <a href="#main-content" className="skip-link">{t("common.skipToContent", "Skip to content")}</a>
      {!tutorial && <AccountHoldBanner />}
      {!tutorial && <AdminAlertBanner />}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
       {/* Row 1: Logo · Flex Live · Sell · Notifications · Profile */}
       <div className="flex items-center justify-between gap-2">
        <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="PullBid Live home">
          <img src={logo} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
          <div className="truncate text-sm font-bold tracking-wide">PULL<span className="text-primary">BID</span> <span className="text-live">LIVE</span></div>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link to="/showoff" aria-label={t("nav.flexLive")} className="flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("nav.flexLive")}
          </Link>
          <SellMenu />
          {!tutorial && <NotificationBell />}
          <Link to="/profile" aria-label={t("nav.profile", "Profile")} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
       </div>
       {/* Row 2: Search · utility icons (Language, Security/Shield, Bookmarks, Cart) */}
       <div className="mt-2.5 flex flex-wrap items-center gap-2">
         <BackButton />
         <HeaderSearch className="min-w-0 flex-1 basis-full sm:basis-0" />
         <div className="flex items-center gap-1.5">
           <LanguageToggle />
           {!tutorial && <AdminAlertBadge />}
           <Link to="/bookmarks" aria-label={t("nav.bookmarks", "Bookmarked shows")} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
             <Bookmark className="h-4 w-4" aria-hidden="true" />
           </Link>
           <Link to="/cart" aria-label={cartCount > 0 ? `${t("nav.cart", "Cart")} (${cartCount})` : t("nav.cart", "Cart")} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted">
             <ShoppingBag className="h-4 w-4" aria-hidden="true" />
             {cartCount > 0 && (
               <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
                 {cartCount}
               </span>
             )}
           </Link>
         </div>
       </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 pb-20">{children}</main>
      {!tutorial && <HelpBubble />}
      {!tutorial && <NotifyPrompt />}
      {!tutorial && <ReturnToLiveBadge />}
      {!tutorial && <FeedbackWidget />}
      <nav aria-label={t("nav.primary", "Primary")} className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur">
        <div className={`grid`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const active = loc.pathname === tab.to || (tab.to !== "/" && loc.pathname.startsWith(tab.to));
            const Icon = tab.icon;
            return (
              <Link key={tab.to} to={tab.to} aria-label={t(tab.labelKey)} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

