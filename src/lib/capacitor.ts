/**
 * Capacitor bootstrap — runs only on real iOS/Android shells.
 *
 * In the browser (web + PWA) every call short-circuits via `isNative()`
 * so this file is safe to import unconditionally from client code.
 * All Capacitor plugins are dynamically imported so they tree-shake out
 * of the web bundle.
 */

import { authDiagnostic } from "@/lib/authDiagnostics";

let cachedNative: boolean | null = null;

export function isNative(): boolean {
  if (cachedNative !== null) return cachedNative;
  if (typeof window === "undefined") return (cachedNative = false);
  // Capacitor injects a global; check without importing the package on web.
  const cap = (window as any).Capacitor;
  cachedNative = !!cap?.isNativePlatform?.();
  return cachedNative;
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (window as any).Capacitor;
  const p = cap?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

const APP_LINK_HOSTS = new Set([
  "pullbidlive.com",
  "www.pullbidlive.com",
  "card-flow-stream.lovable.app",
]);

function paramsFromCallback(url: URL) {
  const params = new URLSearchParams(url.search);
  if (url.hash) {
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  }
  return params;
}

function safeCallbackReturnTo(raw: string) {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

async function completeOAuthCallback(url: URL, fallbackPath: string) {
  const params = paramsFromCallback(url);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const returnTo = safeCallbackReturnTo(params.get("returnTo") || fallbackPath || "/");
  authDiagnostic("auth-deeplink", "OAuth callback parsed", {
    path: fallbackPath,
    returnTo,
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    error: params.get("error") || undefined,
    state: params.get("state") || undefined,
  });
  if (accessToken && refreshToken) {
    const { supabase } = await import("@/integrations/supabase/client");
    const { clearNativeOAuthState, readNativeOAuthState } = await import("@/lib/socialAuthFlow");
    const expectedState = readNativeOAuthState()?.state;
    const callbackState = params.get("state");
    if (expectedState && callbackState && expectedState !== callbackState) {
      authDiagnostic("auth-deeplink", "OAuth state mismatch", { expectedState, callbackState }, "error");
      return returnTo;
    }
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      authDiagnostic("auth-deeplink", "setSession failed", { error: error.message }, "error");
      return returnTo;
    }
    clearNativeOAuthState();
    authDiagnostic("auth-deeplink", "authentication completion confirmed", { returnTo });
  }
  return returnTo;
}

async function routeNativeUrl(rawUrl?: string | null) {
  authDiagnostic("auth-deeplink", "appUrlOpen received", { url: rawUrl });
  if (!rawUrl || typeof window === "undefined") return;
  try {
    const url = new URL(rawUrl);
    const isAppLink = url.protocol === "https:" && APP_LINK_HOSTS.has(url.hostname);
    const isCustomScheme = url.protocol === "pullbidlive:" || url.protocol === "com.pullbidlive.app:";
    authDiagnostic("auth-deeplink", "parsed", { host: url.hostname, path: url.pathname, hasHash: !!url.hash, isAppLink, isCustomScheme });
    if (!isAppLink && !isCustomScheme) {
      authDiagnostic("auth-deeplink", "URL not recognized as app/custom link — ignoring", undefined, "warn");
      return;
    }

    const target = isCustomScheme
      ? `${url.hostname ? `/${url.hostname}` : ""}${url.pathname || ""}${url.search}${url.hash}`
      : `${url.pathname}${url.search}${url.hash}`;
    const callbackPath = isCustomScheme ? `${url.hostname ? `/${url.hostname}` : ""}${url.pathname || ""}` : url.pathname;
    const next = callbackPath.startsWith("/auth/callback")
      ? await completeOAuthCallback(url, callbackPath)
      : target && target !== "" ? target : "/";
    authDiagnostic("auth-deeplink", "routing WebView", { next });
    import("@capacitor/browser")
      .then(({ Browser }) => Browser.close().catch(() => undefined))
      .catch(() => undefined);
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.location.href = next;
    }
  } catch (e) {
    console.warn("[capacitor] deep link parse failed", e);
  }
}

/**
 * Configure status bar, splash, keyboard, hardware back, and app lifecycle.
 * Idempotent — calling twice is a no-op.
 */
let initialized = false;
export async function initCapacitor(): Promise<void> {
  if (initialized || !isNative()) return;
  initialized = true;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (nativePlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
    }
  } catch (e) {
    console.warn("[capacitor] status bar init failed", e);
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    // Wait one frame so the React tree paints before hiding the splash —
    // avoids a flash of background between splash and first render.
    requestAnimationFrame(() => {
      void SplashScreen.hide({ fadeOutDuration: 200 });
    });
  } catch (e) {
    console.warn("[capacitor] splash hide failed", e);
  }

  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    await Keyboard.setScroll({ isDisabled: false });
    // Toggle a body class so we can pad bottom nav / lift composers above the keyboard.
    Keyboard.addListener("keyboardWillShow", () => {
      document.body.classList.add("kb-open");
    });
    Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("kb-open");
    });
  } catch (e) {
    console.warn("[capacitor] keyboard init failed", e);
  }

  try {
    const { App } = await import("@capacitor/app");
    const launch = await App.getLaunchUrl();
    if (launch?.url) routeNativeUrl(launch.url);
    App.addListener("appUrlOpen", ({ url }) => {
      routeNativeUrl(url);
    });
    // Hardware back on Android: pop history, or exit on root.
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch (e) {
    console.warn("[capacitor] app listener failed", e);
  }

  // Deep-link when a native push notification is tapped. The payload's
  // `link`/`url` (set by our notification senders) routes to the right screen.
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action?.notification?.data ?? {}) as Record<string, string>;
      const target = data.link || data.url;
      if (target && typeof target === "string" && target.startsWith("/")) {
        // Defer to next tick so the web view is ready to navigate.
        setTimeout(() => { window.location.href = target; }, 0);
      }
    });
  } catch (e) {
    console.warn("[capacitor] push tap listener failed", e);
  }
}


/**
 * Native share via Capacitor when available, falling back to navigator.share,
 * then to a clipboard copy. Returns true if anything succeeded.
 */
export async function nativeShare(opts: { title?: string; text?: string; url: string }): Promise<boolean> {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return true;
    } catch (e: any) {
      if (e?.message?.includes("cancel")) return false;
      console.warn("[capacitor] native share failed", e);
    }
  }
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ title: opts.title, text: opts.text, url: opts.url });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(opts.url);
    return true;
  } catch {
    return false;
  }
}

/** Lightweight haptic tap — silent no-op on web. */
export async function hapticTap(style: "light" | "medium" | "heavy" = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({
      style: style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch {
    /* swallow */
  }
}
