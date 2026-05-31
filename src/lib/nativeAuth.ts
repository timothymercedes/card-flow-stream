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

const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
const APPLE_SERVICES_ID = import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined;

let initialized = false;

/** True only when the native shell AND the relevant client IDs are configured. */
export function nativeAuthAvailable(provider: "google" | "apple"): boolean {
  if (!isNative()) return false;
  if (provider === "google") return !!GOOGLE_WEB_CLIENT_ID;
  if (provider === "apple") return !!(APPLE_SERVICES_ID || nativePlatform() === "ios");
  return false;
}

async function ensureInit() {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: GOOGLE_WEB_CLIENT_ID
      ? {
          webClientId: GOOGLE_WEB_CLIENT_ID,
          iOSClientId: GOOGLE_IOS_CLIENT_ID,
        }
      : undefined,
    apple: APPLE_SERVICES_ID ? { clientId: APPLE_SERVICES_ID } : undefined,
  });
  initialized = true;
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
    console.log("[native-auth] unavailable, falling back to browser flow", { provider });
    return false;
  }
  await ensureInit();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // Apple requires a hashed nonce; Google accepts a raw nonce passed through.
  const rawNonce = makeNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  console.log("[native-auth] launching native sheet", { provider });
  const res: any = await SocialLogin.login({
    provider,
    options:
      provider === "google"
        ? { scopes: ["email", "profile"], nonce: rawNonce }
        : { scopes: ["email", "name"], nonce: hashedNonce },
  });

  const idToken: string | undefined = res?.result?.idToken;
  if (!idToken) {
    console.warn("[native-auth] no idToken returned", res);
    throw new Error("Native sign-in did not return an identity token");
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider,
    token: idToken,
    nonce: provider === "google" ? rawNonce : undefined,
  });
  if (error) {
    console.error("[native-auth] signInWithIdToken failed", error.message);
    throw error;
  }
  console.log("[native-auth] session established for", provider);
  return true;
}
