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

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (document.getElementById(SCRIPT_ID)) {
    return new Promise((res) => {
      const check = () => (window.turnstile ? res() : setTimeout(check, 50));
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
  className?: string;
}

/**
 * Cloudflare Turnstile widget. Renders nothing if no site key is configured
 * (fail-open in local/dev) so the auth form remains usable.
 */
export function Turnstile({ action, onVerify, onExpire, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

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
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          callback: (t: string) => onVerify(t),
          "expired-callback": () => onExpire?.(),
          "error-callback": () => setError("Verification failed, please retry"),
          theme: "auto",
        });
      })
      .catch(() => setError("Could not load verification"));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action, onVerify, onExpire]);

  if (!siteKey) return null;
  return (
    <div className={className}>
      <div ref={ref} />
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
