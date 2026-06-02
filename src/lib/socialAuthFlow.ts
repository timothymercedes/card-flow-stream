import { lovable } from "@/integrations/lovable";
import { authDiagnostic } from "@/lib/authDiagnostics";
import { isNative } from "@/lib/capacitor";
import { nativeAuthAvailable } from "@/lib/nativeAuth";

type SocialProvider = "google" | "apple";

const NATIVE_OAUTH_STATE_KEY = "pullbidlive.nativeOAuthState";

function safeReturnTo(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

function nativeRedirectUri(returnTo: string): string {
  const url = new URL("pullbidlive://auth/callback");
  url.searchParams.set("returnTo", safeReturnTo(returnTo));
  return url.toString();
}

export async function beginSocialSignIn(provider: SocialProvider, returnTo: string) {
  const isNativeShell = isNative();
  const normalizedReturnTo = safeReturnTo(returnTo);
  const webRedirectUri = new URL(normalizedReturnTo, window.location.origin).toString();
  authDiagnostic("auth-oauth", "start", {
    provider,
    isNativeShell,
    webRedirectUri,
    returnTo: normalizedReturnTo,
    ua: navigator.userAgent,
  });

  if (isNativeShell) {
    // When a native account sheet is available for this provider, it is the ONLY
    // acceptable path. We must never fall back to the in-app browser
    // (SFSafariViewController), which shows URL/share/refresh/back/close chrome
    // and breaks the native app experience. If the native sheet fails, surface
    // the error and keep the user inside the app shell.
    const hasNative = nativeAuthAvailable(provider);
    try {
      const { nativeSignIn } = await import("@/lib/nativeAuth");
      const ok = await nativeSignIn(provider);
      if (ok) {
        authDiagnostic("auth-oauth", "native sign-in completed", { provider, returnTo: normalizedReturnTo });
        return { status: "completed" as const, returnTo: normalizedReturnTo };
      }
    } catch (e: any) {
      if (e?.message && /cancel/i.test(e.message)) return { status: "cancelled" as const, returnTo: normalizedReturnTo };
      if (hasNative) {
        // Native is configured but failed — do NOT open the in-app browser.
        authDiagnostic("auth-oauth", "native sign-in failed (no browser fallback)", { provider, error: e?.message }, "error");
        throw e instanceof Error ? e : new Error("Native sign-in failed");
      }
      authDiagnostic("auth-oauth", "native sign-in failed, opening broker fallback", { provider, error: e?.message }, "warn");
    }

    if (hasNative) {
      // nativeSignIn returned false despite native being available — treat as
      // an unavailable account sheet rather than degrading to the browser.
      authDiagnostic("auth-oauth", "native sheet unavailable (no browser fallback)", { provider }, "error");
      throw new Error("Native sign-in is unavailable. Please try again.");
    }

    // Native account sheet not configured for this provider/platform — use the
    // broker in a native auth session as a last resort.
    const state = crypto.randomUUID?.() ?? String(Date.now());
    const redirectUri = nativeRedirectUri(normalizedReturnTo);
    window.localStorage.setItem(NATIVE_OAUTH_STATE_KEY, JSON.stringify({ state, provider, returnTo: normalizedReturnTo, ts: Date.now() }));
    const url = new URL("/~oauth/initiate", window.location.origin);
    url.searchParams.set("provider", provider);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    authDiagnostic("auth-oauth", "opening broker in native auth session", {
      provider,
      brokerUrl: url.toString(),
      redirectUri,
      state,
    });
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: url.toString(), presentationStyle: "fullscreen", toolbarColor: "#0a0a0a" });
    return { status: "pending-redirect" as const, returnTo: normalizedReturnTo };
  }


  const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: webRedirectUri });
  authDiagnostic("auth-oauth", "web broker result", {
    provider,
    redirected: (result as any)?.redirected,
    error: (result as any)?.error?.message,
  });
  if (result.error) throw result.error;
  return { status: result.redirected ? "pending-redirect" as const : "completed" as const, returnTo: normalizedReturnTo };
}

export function readNativeOAuthState() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(NATIVE_OAUTH_STATE_KEY) || "null");
  } catch {
    return null;
  }
}

export function clearNativeOAuthState() {
  if (typeof window !== "undefined") window.localStorage.removeItem(NATIVE_OAUTH_STATE_KEY);
}