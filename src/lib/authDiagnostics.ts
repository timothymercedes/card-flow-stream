const STORAGE_KEY = "pullbidlive.authDiagnostics";
const MAX_ENTRIES = 120;

type AuthLogLevel = "log" | "warn" | "error";
type AuthLogTag = "auth-oauth" | "native-auth" | "auth-deeplink";

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const lower = key.toLowerCase();
      if (lower.includes("token") || lower.includes("secret") || lower.includes("code")) {
        if (typeof entry === "string") return [key, entry ? `[redacted:${entry.length}]` : ""];
        return [key, "[redacted]"];
      }
      return [key, sanitize(entry)];
    }),
  );
}

export function authDiagnostic(tag: AuthLogTag, message: string, data?: unknown, level: AuthLogLevel = "log") {
  const safeData = sanitize(data);
  const entry = { ts: new Date().toISOString(), tag, message, data: safeData };

  if (level === "error") console.error(`[${tag}] ${message}`, safeData ?? "");
  else if (level === "warn") console.warn(`[${tag}] ${message}`, safeData ?? "");
  else console.log(`[${tag}] ${message}`, safeData ?? "");

  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const next = Array.isArray(existing) ? [...existing, entry].slice(-MAX_ENTRIES) : [entry];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    (window as any).__PULLBID_AUTH_DIAGNOSTICS__ = next;
  } catch {
    // Diagnostics must never block login.
  }
}

export function getAuthDiagnostics() {
  if (typeof window === "undefined") return [];
  try {
    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(existing) ? existing : [];
  } catch {
    return [];
  }
}