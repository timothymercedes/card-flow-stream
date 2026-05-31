/**
 * Native in-app social sign-in (iOS/Android) using the OS-native account sheet.
 *
 * Flow: native sheet (Credential Manager / ASAuthorizationController) → idToken
 * → exchanged with Supabase via `signInWithIdToken`. No Safari/Chrome, no
 * Universal-Link round-trip — the user never leaves the app.
 *
 * Falls back to the Lovable broker browser flow when:
 *   - not running in a native shell, OR
 *   - the required client IDs are not configured (see env vars below).
 *
 * Required public client IDs (NOT secrets — safe to ship in the bundle):
 *   VITE_GOOGLE_WEB_CLIENT_ID   – Google "Web application" OAuth client ID
 *   VITE_GOOGLE_IOS_CLIENT_ID   – Google "iOS" OAuth client ID
 *   VITE_APPLE_SERVICES_ID      – Apple "Services ID" (e.g. com.pullbidlive.signin)
 */
import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform } from "@/lib/capacitor";
import { authDiagnostic } from "@/lib/authDiagnostics";

const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;

let initialized = false;

/** True only when the native shell AND the relevant client IDs are configured. */
export function nativeAuthAvailable(provider: "google" | "apple"): boolean {
  if (!isNative()) return false;
  const platform = nativePlatform();
  if (provider === "google") return platform === "ios" ? !!GOOGLE_WEB_CLIENT_ID && !!GOOGLE_IOS_CLIENT_ID : !!GOOGLE_WEB_CLIENT_ID;
  if (provider === "apple") return platform === "ios" || !!APPLE_SERVICES_ID;
  return false;
}

/**
 * Human-readable summary of which sign-in path each provider will take in the
 * current runtime. Used by the on-device auth diagnostic banner so testers can
 * confirm (in dev/TestFlight) whether the NATIVE sheet or the BROWSER fallback
 * will be used — without reading logs.
 */
export function describeAuthPaths() {
  const native = isNative();
  const platform = nativePlatform();
  const google = nativeAuthAvailable("google");
  const apple = nativeAuthAvailable("apple");
  return {
    native,
    platform,
    google: { native: google, path: google ? "native sheet" : native ? "browser fallback" : "browser OAuth" },
    apple: { native: apple, path: apple ? "native sheet" : native ? "browser fallback" : "browser OAuth" },
    ids: {
      googleWeb: !!GOOGLE_WEB_CLIENT_ID,
      googleIos: !!GOOGLE_IOS_CLIENT_ID,
      appleServices: !!APPLE_SERVICES_ID,
    },
  };
}

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: GOOGLE_WEB_CLIENT_ID
      ? {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
          iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
          mode: "online",
        }
      : undefined,
    apple: {
      clientId: APPLE_SERVICES_ID || "com.pullbidlive.app",
      redirectUrl: APPLE_SERVICES_ID ? "https://pullbidlive.com/auth" : "",
      useBroadcastChannel: nativePlatform() === "android",
    },
  });
  initialized = true;
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Run the native sign-in sheet and create a Supabase session.
 * Returns `true` on success. Throws on a real error; returns `false` if the
 * caller should fall back to the browser flow (native unavailable / cancelled).
 */
export async function nativeSignIn(provider: "google" | "apple"): Promise<boolean> {
  if (!nativeAuthAvailable(provider)) {
    authDiagnostic("native-auth", "unavailable, falling back to browser flow", {
      provider,
      platform: nativePlatform(),
      hasGoogleWebClientId: !!GOOGLE_WEB_CLIENT_ID,
      hasGoogleIosClientId: !!GOOGLE_IOS_CLIENT_ID,
      hasAppleServicesId: !!APPLE_SERVICES_ID,
    });
    return false;
  }
  await ensureInit();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // Native Google/Apple SDKs put the SHA-256 nonce digest in the ID token.
  // Supabase receives the raw nonce and verifies it against that digest.
  const rawNonce = makeNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  authDiagnostic("native-auth", "launching native sheet", { provider, platform: nativePlatform() });
  const res: any = await SocialLogin.login({
    provider,
    options:
      provider === "google"
        ? { scopes: ["email", "profile"], nonce: hashedNonce, style: "bottom", filterByAuthorizedAccounts: false, autoSelectEnabled: false, forcePrompt: true }
        : { scopes: ["email", "name"], nonce: hashedNonce, useBroadcastChannel: nativePlatform() === "android" },
  } as any);


  const idToken: string | undefined = res?.result?.idToken;
  if (!idToken) {
    authDiagnostic("native-auth", "no idToken returned", { provider, responseKeys: Object.keys(res?.result ?? {}) }, "warn");
    throw new Error("Native sign-in did not return an identity token");
  }
  const payload = decodeJwtPayload(idToken);
  authDiagnostic("native-auth", "idToken received", {
    provider,
    aud: payload?.aud,
    azp: payload?.azp,
    iss: payload?.iss,
    hasNonce: !!payload?.nonce,
    expectedGoogleAudience: provider === "google" ? GOOGLE_WEB_CLIENT_ID : undefined,
  });

  const { error } = await supabase.auth.signInWithIdToken({
    provider,
    token: idToken,
    nonce: provider === "google" ? rawNonce : undefined,
    access_token: res?.result?.accessToken?.token,
  });
  if (error) {
    authDiagnostic("native-auth", "signInWithIdToken failed", { provider, error: error.message }, "error");
    throw error;
  }
  authDiagnostic("native-auth", "session established", { provider });
  return true;
}
