import { Link, useLocation } from "@tanstack/react-router";
import {
  Home, Radio, Store, Lock, MessageCircle, User, Package, Newspaper, Sparkles,
  Menu, Bookmark, ShoppingBag, Shield, Settings, MessageCircleHeart, LogOut, ChevronDown,
  Bell, Wallet, TrendingUp, BarChart3, Gift, Video, CalendarDays, Users, Crown, Grid3x3,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "@/components/HeaderSearch";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { AdminAlertBanner } from "@/components/AdminAlertBanner";
import { AccountHoldBanner } from "@/components/AccountHoldBanner";
import { HelpBubble } from "@/components/HelpBubble";
import { ReturnToLiveBadge } from "@/components/ReturnToLiveBadge";
import { FeedbackWidget, openFeedback } from "@/components/FeedbackWidget";
import { SellMenu } from "@/components/SellMenu";
import { XPBadge } from "@/components/XPBadge";
import { DailyLoginRewardModal } from "@/components/DailyLoginRewardModal";
import { CollabInviteBanner } from "@/components/CollabInviteBanner";
import { AchievementToastListener, LevelUpListener } from "@/components/AchievementToastListener";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTutorialMode } from "@/lib/tutorialMode";
import { useRealtimeChannel } from "@/lib/realtime";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import logo from "@/assets/logo.png";

// Primary nav — shown on desktop top bar AND in mobile bottom bar (trimmed)
const PRIMARY = [
  { to: "/", labelKey: "nav.home", icon: Home, mobile: true },
  { to: "/live", labelKey: "nav.live", icon: Radio, mobile: true },
  { to: "/market", labelKey: "nav.market", icon: Store, mobile: true },
  { to: "/vault", labelKey: "nav.vault", icon: Lock, mobile: true },
  { to: "/shop", labelKey: "nav.shop", icon: ShoppingBag, mobile: false },
  { to: "/feed", labelKey: "nav.feed", icon: Newspaper, mobile: false },
  { to: "/messages", labelKey: "nav.chat", icon: MessageCircle, mobile: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user, signOut } = useAuth();
  const tutorial = useTutorialMode();
  const { t } = useTranslation();
  const [isSeller, setIsSeller] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const isActive = (to: string) =>
    loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));

  // Mobile bottom tabs: keep to 5 essentials + More
  const mobileTabs = PRIMARY.filter((t) => t.mobile);

  // Desktop nav: all primary + seller hub when applicable
  const desktopNav = [
    ...PRIMARY,
    ...(isSeller ? [{ to: "/store", labelKey: "nav.sellerHub", icon: Package }] : []),
  ];

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <a href="#main-content" className="skip-link">{t("common.skipToContent", "Skip to content")}</a>
      {!tutorial && <AccountHoldBanner />}
      {!tutorial && <AdminAlertBanner />}

      {/* ========== Header ========== */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        {/* Top row — logo + (desktop nav) + actions */}
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="PullBid Live home">
            <img src={logo} alt="" aria-hidden="true" className="h-9 w-9 object-contain" />
            <div className="hidden whitespace-nowrap text-sm font-bold tracking-wide sm:block">
              PULL<span className="text-primary">BID</span> <span className="text-live">LIVE</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <nav aria-label={t("nav.primary", "Primary")} className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
            {desktopNav.map((tab) => {
              const active = isActive(tab.to);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t(tab.labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Spacer for mobile/tablet */}
          <div className="flex-1 lg:hidden" />

          {/* Right cluster */}
          <div className="flex shrink-0 items-center gap-1">
            <SellMenu />
            {!tutorial && <NotificationBell />}
            {!tutorial && <XPBadge />}
            {/* Desktop-only quick actions */}
            <Link to="/cart" aria-label={t("nav.cart", "Cart")} className="relative hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {cartCount > 0 && (
                <span aria-hidden="true" className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
            {/* Account dropdown — desktop has a full menu; mobile keeps a simple link to /profile */}
            <Link
              to="/profile"
              aria-label={t("nav.profile", "Profile")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted ring-1 ring-border hover:bg-accent lg:hidden"
            >
              <User className="h-4 w-4" aria-hidden="true" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("nav.profile", "Profile")}
                className="hidden h-8 items-center gap-1 rounded-full bg-muted px-1.5 pr-2 ring-1 ring-border hover:bg-accent lg:inline-flex"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  {user?.email || t("nav.account", "Account")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile"><User className="mr-2 h-4 w-4" />{t("nav.profile", "Profile")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/orders"><Package className="mr-2 h-4 w-4" />{t("nav.orders", "Orders")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/bookmarks"><Bookmark className="mr-2 h-4 w-4" />{t("nav.bookmarks", "Bookmarks")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/vault"><Lock className="mr-2 h-4 w-4" />{t("nav.vault", "Vault")}</Link>
                </DropdownMenuItem>
                {isSeller && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/store"><Package className="mr-2 h-4 w-4" />{t("nav.sellerHub", "Seller Hub")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/my-listings"><Store className="mr-2 h-4 w-4" />{t("nav.listings", "Listings")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/payouts"><Shield className="mr-2 h-4 w-4" />{t("nav.payouts", "Payouts")}</Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings"><Settings className="mr-2 h-4 w-4" />{t("nav.settings", "Settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/support"><MessageCircleHeart className="mr-2 h-4 w-4" />{t("nav.support", "Support")}</Link>
                </DropdownMenuItem>
                {user && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => { void signOut(); }}>
                      <LogOut className="mr-2 h-4 w-4" />{t("nav.signOut", "Sign out")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* More — opens sheet (hidden on lg+ where everything is in top nav) */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger
                aria-label={t("nav.more", "More")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{t("nav.more", "More")}</SheetTitle>
                </SheetHeader>
                <MoreSheet
                  onNavigate={() => setMoreOpen(false)}
                  isSeller={isSeller}
                  cartCount={cartCount}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Second row — back + search + Flex (mobile/tablet only) */}
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 pb-2 sm:px-4 lg:hidden">
          <BackButton />
          <HeaderSearch className="min-w-0 flex-1" />
          {isSeller && (
            <Link
              to="/my-listings"
              aria-label="My Store"
              title="My Store"
              className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-primary/15 px-2.5 text-primary ring-1 ring-primary/30"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs font-semibold">My Store</span>
            </Link>
          )}
          <Link
            to="/showoff"
            aria-label={t("nav.flexLive")}
            title={t("nav.flexLive")}
            className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2.5 text-white shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs font-semibold">{t("nav.flexLive")}</span>
          </Link>
        </div>

        {/* Desktop search row */}
        <div className="mx-auto hidden w-full max-w-7xl items-center gap-2 px-4 pb-3 lg:flex">
          <HeaderSearch className="min-w-0 max-w-xl flex-1" />
          {isSeller && (
            <Link
              to="/my-listings"
              aria-label="My Store"
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-full bg-primary/15 px-3 text-primary ring-1 ring-primary/30"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs font-semibold">My Store</span>
            </Link>
          )}
          <Link
            to="/showoff"
            aria-label={t("nav.flexLive")}
            className={`${isSeller ? "" : "ml-auto"} inline-flex h-8 items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 text-white shadow-sm`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs font-semibold">{t("nav.flexLive")}</span>
          </Link>
        </div>
      </header>

      {/* ========== Main ========== */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 pb-24 lg:pb-8"
      >
        {children}
      </main>

      {/* ========== Global widgets ========== */}
      {!tutorial && <HelpBubble />}
      {!tutorial && <NotifyPrompt />}
      {!tutorial && <ReturnToLiveBadge />}
      {!tutorial && <FeedbackWidget />}
      {!tutorial && <DailyLoginRewardModal />}
      {!tutorial && <CollabInviteBanner />}
      {!tutorial && <AchievementToastListener />}
      {!tutorial && <LevelUpListener />}

      {/* ========== Mobile bottom nav ========== */}
      <nav
        aria-label={t("nav.primary", "Primary")}
        data-bottom-nav
        className="pb-bottom-nav fixed bottom-0 left-0 right-0 z-30 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform duration-200 lg:hidden"
      >
        <div
          className="mx-auto grid w-full max-w-2xl"
          style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }}
        >
          {mobileTabs.map((tab) => {
            const active = isActive(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-label={t(tab.labelKey)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors active:scale-95 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label={t("nav.more", "More")}
            className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {t("nav.more", "More")}
          </button>
        </div>
      </nav>
    </div>
  );
}

/* ----------- More sheet ----------- */
function MoreSheet({
  onNavigate,
  isSeller,
  cartCount,
}: {
  onNavigate: () => void;
  isSeller: boolean;
  cartCount: number;
}) {
  const { t } = useTranslation();

  const sections: { title: string; items: { to?: string; onClick?: () => void; icon: any; label: string; badge?: number }[] }[] = [
    {
      title: t("nav.shop", "Shop"),
      items: [
        { to: "/cart", icon: ShoppingBag, label: t("nav.cart", "Cart"), badge: cartCount || undefined },
        { to: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks", "Bookmarks") },
        { to: "/orders", icon: Package, label: t("nav.orders", "Orders") },
      ],
    },
    {
      title: t("nav.social", "Social"),
      items: [
        { to: "/feed", icon: Newspaper, label: t("nav.feed", "Feed") },
        { to: "/messages", icon: MessageCircle, label: t("nav.chat", "Messages") },
        { to: "/quests", icon: Sparkles, label: t("nav.quests", "Quests") },
      ],
    },
    ...(isSeller
      ? [{
          title: t("nav.seller", "Seller"),
          items: [
            { to: "/store", icon: Package, label: t("nav.sellerHub", "Seller Hub") },
            { to: "/my-listings", icon: Store, label: t("nav.listings", "Listings") },
            { to: "/payouts", icon: Shield, label: t("nav.payouts", "Payouts") },
          ],
        }]
      : []),
    {
      title: t("nav.account", "Account"),
      items: [
        { to: "/settings", icon: Settings, label: t("nav.settings", "Settings") },
        { to: "/settings", icon: Shield, label: t("nav.security", "Security") },
        { to: "/support", icon: MessageCircleHeart, label: t("nav.support", "Support") },
        { onClick: () => { openFeedback(); onNavigate(); }, icon: MessageCircleHeart, label: t("nav.feedback", "Send feedback") },
      ],
    },
  ];

  return (
    <div className="mt-2 space-y-5">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.title}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            {s.items.map((it, i) => {
              const Icon = it.icon;
              const inner = (
                <span className="flex items-center gap-3 px-3 py-3 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{it.label}</span>
                  {typeof it.badge === "number" && (
                    <span className="rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-live-foreground">
                      {it.badge}
                    </span>
                  )}
                </span>
              );
              const cls = `block w-full text-left hover:bg-muted/50 ${i !== 0 ? "border-t border-border/60" : ""}`;
              return it.to ? (
                <Link key={`${it.label}-${i}`} to={it.to} onClick={onNavigate} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={`${it.label}-${i}`} onClick={it.onClick} className={cls}>
                  {inner}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-1 pt-2">
        <span className="text-xs text-muted-foreground">{t("nav.language", "Language")}</span>
        <LanguageToggle />
      </div>
    </div>
  );
}
