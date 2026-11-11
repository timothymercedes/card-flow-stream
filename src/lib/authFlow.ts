export function safeAuthReturnTo(raw: string | undefined, origin: string): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname === "/auth") return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}

export function signupNextStep(session: unknown): "confirm-email" | "onboarding" {
  return session ? "onboarding" : "confirm-email";
}

export const OAUTH_RETURN_KEY = "pullbidlive.oauthReturnTo";