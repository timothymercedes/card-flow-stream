/**
 * Internal Tutorial Mode
 *
 * Locked-down flag that lets internal recording sessions bypass auth, Stripe
 * Connect, and seller approval gates so we can capture the real UI for
 * onboarding videos. NEVER exposed to public users.
 *
 * Activation rules (ALL must be true):
 *  1. Build signal: dev build OR VITE_TUTORIAL_MODE_ENABLED === "true"
 *     OR the current authenticated user has admin role (checked elsewhere).
 *  2. Session opt-in: ?tour=1 in URL, or sessionStorage flag already set.
 *
 * Stored in sessionStorage only (cleared on tab close). Never localStorage,
 * never cookie. The synthetic demo user id is intentionally not a uuid so
 * any accidental DB call is rejected by RLS.
 */
import { useEffect, useState } from "react";

const KEY = "pbl_tour_mode";

function tutorialModeHostAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovableproject.com") ||
    host.startsWith("id-preview--") ||
    host.startsWith("project--c81c8301-d89c-4830-8ab7-06f678968bc1-dev")
  );
}

export function tutorialModeBuildAllowed(): boolean {
  try {
    if (import.meta.env.DEV) return true;
    if (import.meta.env.VITE_TUTORIAL_MODE_ENABLED === "true") return true;
    if (tutorialModeHostAllowed()) return true;
  } catch {}
  return false;
}

export function isTutorialMode(): boolean {
  if (typeof window === "undefined") return false;
  if (!tutorialModeBuildAllowed()) {
    // Admin override path: a flag set by an admin earlier in this session is
    // the only way prod can be in tutorial mode. We trust it because admin
    // status was verified before it was set.
    try {
      return sessionStorage.getItem(KEY) === "admin";
    } catch {
      return false;
    }
  }
  try {
    return sessionStorage.getItem(KEY) === "1" || sessionStorage.getItem(KEY) === "admin";
  } catch {
    return false;
  }
}

export function enableTutorialMode(adminVerified = false) {
  if (typeof window === "undefined") return;
  if (!adminVerified && !tutorialModeBuildAllowed()) return;
  try {
    sessionStorage.setItem(KEY, adminVerified ? "admin" : "1");
  } catch {}
}

export function disableTutorialMode() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(KEY); } catch {}
}

export function useTutorialMode(): boolean {
  const [on, setOn] = useState(() => isTutorialMode());
  useEffect(() => {
    const check = () => setOn(isTutorialMode());
    check();
    window.addEventListener("storage", check);
    window.addEventListener("pbl-tour-change", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("pbl-tour-change", check);
    };
  }, []);
  return on;
}

export function useTutorialData<T>(realData: T, demoData: T): T {
  return useTutorialMode() ? demoData : realData;
}

/** Synthetic demo user — id is intentionally NOT a uuid so DB calls fail safely. */
export const TUTORIAL_DEMO_USER = {
  id: "tour-demo-user",
  email: "demo@pullbidlive.tour",
  username: "demo_seller",
  is_seller: true,
  seller_status: "approved" as const,
  avatar_url: null,
  onboarding_completed: true,
  current_streak: 7,
  longest_streak: 14,
  last_login_date: new Date().toISOString().slice(0, 10),
  interests: ["pokemon", "sports"],
};
