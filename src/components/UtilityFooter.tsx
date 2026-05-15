import { Link } from "@tanstack/react-router";
import { Bookmark, Sparkles, Settings, MessageCircleHeart, ShoppingBag, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/LanguageToggle";
import { openFeedback } from "@/components/FeedbackWidget";

/**
 * UtilityFooter — thin secondary row above the primary bottom tab nav.
 * Hosts low-priority utility actions so they don't crowd the top header.
 */
export function UtilityFooter({ cartCount }: { cartCount: number }) {
  const { t } = useTranslation();

  const itemCls =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

  return (
    <div
      aria-label={t("nav.utility", "Utility")}
      className="fixed bottom-[68px] left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-border/60 bg-background/95 px-3 py-1 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-1">
        <Link to="/cart" aria-label={t("nav.cart", "Cart")} className={`relative ${itemCls}`}>
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {cartCount > 0 && (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
              {cartCount}
            </span>
          )}
        </Link>
        <Link to="/bookmarks" aria-label={t("nav.bookmarks", "Bookmarks")} className={itemCls}>
          <Bookmark className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link to="/quests" aria-label={t("nav.quests", "Quests")} className={itemCls}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-label={t("nav.language", "Language")}>
          <LanguageToggle />
        </div>
        <Link to="/settings" aria-label={t("nav.security", "Security")} className={itemCls}>
          <Shield className="h-4 w-4" aria-hidden="true" />
        </Link>
        <button onClick={openFeedback} aria-label={t("nav.feedback", "Send feedback")} className={itemCls}>
          <MessageCircleHeart className="h-4 w-4" aria-hidden="true" />
        </button>
        <Link to="/settings" aria-label={t("nav.settings", "Settings")} className={itemCls}>
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
