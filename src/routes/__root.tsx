import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { MascotTourProvider } from "@/components/MascotGuide";
import { LegalGate } from "@/components/LegalGate";
import "@/i18n";
import { LanguageSync } from "@/components/LanguageSync";
import { A11yClassSync } from "@/components/A11yClassSync";
import { TutorialModeBootstrap } from "@/components/TutorialModeBootstrap";
import { PerfMonitorBootstrap } from "@/components/PerfMonitorBootstrap";
import { RealtimeStatusBadge } from "@/components/RealtimeStatusBadge";
import { BetaGate, BETA_MODE_ENABLED } from "@/components/BetaGate";
import { BidAnnouncer } from "@/components/BidAnnouncer";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
        <Link to="/" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Pull Bid Live — Live Card Auctions" },
      { name: "description", content: "Live trading card auctions, social feed, and personal vault." },
      { property: "og:title", content: "Pull Bid Live — Live Card Auctions" },
      { name: "twitter:title", content: "Pull Bid Live — Live Card Auctions" },
      { property: "og:description", content: "Live trading card auctions, social feed, and personal vault." },
      { name: "twitter:description", content: "Live trading card auctions, social feed, and personal vault." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0981a193-31b5-4ac9-a0c6-686e770b64b0/id-preview-db3571db--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app-1777903855105.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0981a193-31b5-4ac9-a0c6-686e770b64b0/id-preview-db3571db--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app-1777903855105.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      ...(BETA_MODE_ENABLED
        ? [
            { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
            { name: "googlebot", content: "noindex, nofollow" },
          ]
        : []),
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "PullBidLive" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/logo.png" },
      { rel: "icon", href: "/logo.png", type: "image/png" },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  ),
  component: () => (
    <AuthProvider>
      <MascotTourProvider>
        <LanguageSync />
        <A11yClassSync />
        <TutorialModeBootstrap />
        <PerfMonitorBootstrap />
        <BetaGate>
          <Outlet />
          <LegalGate />
        </BetaGate>
        <RealtimeStatusBadge />
        <BidAnnouncer />
        <Toaster />
      </MascotTourProvider>
    </AuthProvider>
  ),
  notFoundComponent: NotFoundComponent,
});
