import { useEffect, useRef, useState } from "react";
import { getTurnstileSiteKey } from "@/lib/turnstile.functions";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
// If the widget hasn't produced a token within this window, treat it as
// unavailable so the user is never stuck on "Verifying..." forever.
const VERIFY_TIMEOUT_MS = 15000;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (document.getElementById(SCRIPT_ID)) {
    return new Promise((res, rej) => {
      let waited = 0;
      const check = () => {
        if (window.turnstile) return res();
        waited += 50;
        if (waited > 10000) return rej(new Error("turnstile_script_timeout"));
        setTimeout(check, 50);
      };
      check();
    });
  }
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("turnstile_script_failed"));
    document.head.appendChild(s);
  });
}

interface Props {
  action?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** Fired when the widget cannot complete (timeout, network/domain error). */
  onUnavailable?: () => void;
  className?: string;
}

/**
 * Cloudflare Turnstile widget. Renders nothing if no site key is configured
 * (fail-open in local/dev) so the auth form remains usable.
 *
 * Adds a hard timeout + error state so a misconfigured domain or blocked
 * challenge never leaves the user stuck on "Verifying..." indefinitely.
 */
export function Turnstile({ action, onVerify, onExpire, onUnavailable, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifiedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTurnstileSiteKey()
      .then((r) => { if (!cancelled) setSiteKey(r.siteKey || null); })
      .catch(() => { if (!cancelled) setSiteKey(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    verifiedRef.current = false;
    setError(null);

    const clearTimer = () => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };

    const fail = (msg: string) => {
      if (cancelled || verifiedRef.current) return;
      clearTimer();
      setError(msg);
      onUnavailable?.();
    };

    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        // Start the safety timeout once the widget is rendered.
        timeoutRef.current = setTimeout(
          () => fail("Verification is taking too long. You can retry or continue."),
          VERIFY_TIMEOUT_MS,
        );
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          callback: (t: string) => {
            verifiedRef.current = true;
            clearTimer();
            setError(null);
            onVerify(t);
          },
          "expired-callback": () => {
            verifiedRef.current = false;
            onExpire?.();
          },
          "error-callback": () => fail("Verification failed. You can retry or continue."),
          "timeout-callback": () => fail("Verification timed out. You can retry or continue."),
          theme: "auto",
          retry: "never",
        });
      })
      .catch(() => fail("Could not load verification. You can retry or continue."));

    return () => {
      cancelled = true;
      clearTimer();
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action, onVerify, onExpire, onUnavailable, attempt]);

  if (!siteKey) return null;
  return (
    <div className={className}>
      <div ref={ref} />
      {error && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <p className="text-[11px] text-destructive text-center">{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); setAttempt((a) => a + 1); }}
            className="text-[11px] font-semibold text-primary underline"
          >
            Retry verification
          </button>
        </div>
      )}
    </div>
  );
}
