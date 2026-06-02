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
import { getNativeAuthRuntimeConfig } from "@/lib/nativeAuthConfig.functions";

const BUILD_GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
const BUILD_GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
const BUILD_APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;
const AUTH_DIAGNOSTIC_REV = "native-auth-runtime-config-2026-06-02";

type NativeAuthRuntimeConfig = Awaited<ReturnType<typeof getNativeAuthRuntimeConfig>>;

let runtimeConfig: NativeAuthRuntimeConfig | null = null;
let runtimeConfigPromise: Promise<NativeAuthRuntimeConfig | null> | null = null;

let initialized = false;

function present(value?: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolvedConfig() {
  return {
    googleWebClientId: present(BUILD_GOOGLE_WEB_CLIENT_ID) ? BUILD_GOOGLE_WEB_CLIENT_ID : runtimeConfig?.googleWebClientId,
    googleIosClientId: present(BUILD_GOOGLE_IOS_CLIENT_ID) ? BUILD_GOOGLE_IOS_CLIENT_ID : runtimeConfig?.googleIosClientId,
    appleServicesId: present(BUILD_APPLE_SERVICES_ID) ? BUILD_APPLE_SERVICES_ID : runtimeConfig?.appleServicesId,
    sources: {
      googleWebClientId: present(BUILD_GOOGLE_WEB_CLIENT_ID) ? "web bundle" : runtimeConfig?.sourceKeys.googleWebClientId || "missing",
      googleIosClientId: present(BUILD_GOOGLE_IOS_CLIENT_ID) ? "web bundle" : runtimeConfig?.sourceKeys.googleIosClientId || "missing",
      appleServicesId: present(BUILD_APPLE_SERVICES_ID) ? "web bundle" : runtimeConfig?.sourceKeys.appleServicesId || "missing",
    },
  };
}

function providerConfigured(provider: "google" | "apple", cfg = resolvedConfig()): boolean {
  const platform = nativePlatform();
  if (provider === "google") return platform === "ios" ? present(cfg.googleWebClientId) && present(cfg.googleIosClientId) : present(cfg.googleWebClientId);
  if (provider === "apple") return platform === "ios" || present(cfg.appleServicesId);
  return false;
}

export async function loadNativeAuthRuntimeConfig() {
  if (runtimeConfig) return runtimeConfig;
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = getNativeAuthRuntimeConfig()
      .then((config) => {
        runtimeConfig = config;
        return config;
      })
      .catch((error) => {
        authDiagnostic("native-auth", "runtime auth config unavailable", { error: error?.message }, "warn");
        return null;
      });
  }
  return runtimeConfigPromise;
}

/** True only when the native shell AND the relevant client IDs are configured. */
export function nativeAuthAvailable(provider: "google" | "apple"): boolean {
  if (!isNative()) return false;
  return providerConfigured(provider);
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
  const cfg = resolvedConfig();
  const google = native && providerConfigured("google", cfg);
  const apple = native && providerConfigured("apple", cfg);
  return {
    rev: AUTH_DIAGNOSTIC_REV,
    native,
    platform,
    google: { native: google, path: google ? "native sheet" : native ? "browser fallback" : "browser OAuth" },
    apple: { native: apple, path: apple ? "native sheet" : native ? "browser fallback" : "browser OAuth" },
    ids: {
      googleWeb: present(cfg.googleWebClientId),
      googleIos: present(cfg.googleIosClientId),
      appleServices: present(cfg.appleServicesId),
    },
    sources: cfg.sources,
  };
}

async function ensureInit() {
  if (initialized) return;
  const cfg = resolvedConfig();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: cfg.googleWebClientId
      ? {
          webClientId: cfg.googleWebClientId,
          iOSClientId: cfg.googleIosClientId,
          iOSServerClientId: cfg.googleWebClientId,
          mode: "online",
        }
      : undefined,
    apple: {
      clientId: cfg.appleServicesId || "com.pullbidlive.app",
      redirectUrl: cfg.appleServicesId ? "https://pullbidlive.com/auth" : "",
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
  await loadNativeAuthRuntimeConfig();
  const cfg = resolvedConfig();
  if (!isNative() || !providerConfigured(provider, cfg)) {
    authDiagnostic("native-auth", "unavailable, falling back to browser flow", {
      provider,
      platform: nativePlatform(),
      hasGoogleWebClientId: present(cfg.googleWebClientId),
      hasGoogleIosClientId: present(cfg.googleIosClientId),
      hasAppleServicesId: present(cfg.appleServicesId),
      sources: cfg.sources,
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
    expectedGoogleAudience: provider === "google" ? cfg.googleWebClientId : undefined,
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
