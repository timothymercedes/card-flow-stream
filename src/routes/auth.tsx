import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import { startPasskeyLogin, finishPasskeyLogin, checkUsernameAvailable } from "@/server/passkeys.functions";
import { Fingerprint } from "lucide-react";
import logo from "@/assets/logo.png";
import { AgreementModal } from "@/components/AgreementModal";
import { REQUIRED_LEGAL_VERSION, legalAcceptanceMetadata } from "@/lib/legal";
import { Turnstile } from "@/components/Turnstile";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { beginSocialSignIn } from "@/lib/socialAuthFlow";
import { AuthPathBanner } from "@/components/AuthPathBanner";

export const Route = createFileRoute("/auth")({
  component: Auth,
  validateSearch: (s: Record<string, unknown>) => ({
    returnTo: typeof s.returnTo === "string" ? s.returnTo : undefined,
    mode: s.mode === "signup" || s.mode === "signin" || s.mode === "forgot" ? s.mode : undefined,
  }),
});

/** Returns a same-origin path from a returnTo search param, or "/" if invalid. */
function safeReturnTo(raw?: string): string {
  if (!raw) return "/";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

function Auth() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const returnTo = safeReturnTo(search.returnTo);
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameOk, setUsernameOk] = useState<null | boolean>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [tosOk, setTosOk] = useState(false);
  const [guidelinesOk, setGuidelinesOk] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function ensureCaptcha(action: string): Promise<boolean> {
    // If the challenge could not load/complete (e.g. domain not allowed or
    // network blocked), don't trap the user — allow them to proceed.
    if (!captchaToken) {
      if (captchaUnavailable) return true;
      toast.error("Please complete the verification challenge");
      return false;
    }
    try {
      const v = await verifyTurnstile({ data: { token: captchaToken, action } });
      if (!v.success && v.error !== "turnstile_not_configured") {
        toast.error("Verification failed, please retry");
        setCaptchaToken(null);
        return false;
      }
    } catch {
      // Backend verification unreachable — fail open so login isn't blocked.
      return true;
    }
    return true;
  }

  useEffect(() => { if (user) window.location.replace(returnTo); }, [user, returnTo]);

  // Debounced uniqueness check
  useEffect(() => {
    if (mode !== "signup" || !username || username.length < 3) { setUsernameOk(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await checkUsernameAvailable({ data: { username } });
        setUsernameOk(r.available);
      } catch { setUsernameOk(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [username, mode]);

  async function oauth(provider: "google" | "apple") {
    setLoading(true);
    try {
      const result = await beginSocialSignIn(provider, returnTo);
      setLoading(false);
      if (result.status === "completed") window.location.replace(result.returnTo);
    } catch (e: any) {
      setLoading(false);
      toast.error(e?.message || "Sign-in failed");
    }
  }

  async function passkeyLogin() {
    try {
      const { options, challengeKey } = await startPasskeyLogin({ data: { username: username || undefined } });
      const cred = await startAuthentication({ optionsJSON: options as any });
      const res = await finishPasskeyLogin({ data: { response: cred, challengeKey } });
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink", token_hash: res.hashed_token, email: res.email,
      } as any);
      if (error) throw error;
      toast.success("Welcome back");
      window.location.replace(returnTo);
    } catch (e: any) {
      toast.error(e?.message || "Passkey sign-in failed");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      if (!email) return toast.error("Enter your email address");
      if (!(await ensureCaptcha("password_reset"))) return;
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      setLoading(false);
      setCaptchaToken(null);
      // Rate-limit is the only error worth surfacing. For "user not found" Supabase
      // returns no error (privacy-preserving), so we always show success otherwise.
      if (error && /rate|too many|limit/i.test(error.message)) {
        toast.error("Too many attempts. Please wait a minute and try again.");
        return;
      }
      if (error && !/not found|no user/i.test(error.message)) {
        toast.error(error.message);
        return;
      }
      setResetSent(true);
      toast.success("If an account exists for that email, a reset link is on its way.");
      return;
    }
    if (mode === "signup") {
      if (usernameOk === false) return toast.error("Username already taken");
      if (!email || !password) return toast.error("Email and password required");
      if (!ageOk) return toast.error("You must confirm you are 18 or older");
      if (!tosOk) return toast.error("You must agree to the Terms & Privacy Policy");
      if (!guidelinesOk) return toast.error("You must agree to the Community Guidelines");
      if (!(await ensureCaptcha("signup"))) return;
      setShowTerms(true);
      return;
    }
    if (!(await ensureCaptcha("signin"))) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCaptchaToken(null);
    if (error) toast.error(error.message); else window.location.replace(returnTo);
    setLoading(false);
  }

  async function completeSignup() {
    setLoading(true);
    const acceptanceMeta = legalAcceptanceMetadata();
    const { data: signupData, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { username, is_seller: isSeller, ...acceptanceMeta } },
    });
    if (error) {
      // Surface HIBP / weak-password errors clearly
      const msg = /pwned|breach|leaked/i.test(error.message)
        ? "This password has appeared in a known data breach. Please choose a different one."
        : error.message;
      toast.error(msg);
      setLoading(false);
      return;
    }
    const uid = signupData.user?.id;
    // Supabase returns user with empty identities array when email already exists
    // (privacy-preserving). Detect this and surface a clearer error.
    const identities = (signupData.user as any)?.identities;
    if (uid && Array.isArray(identities) && identities.length === 0) {
      toast.error("An account with this email already exists. Try signing in instead.");
      setShowTerms(false);
      setMode("signin");
      setLoading(false);
      return;
    }
    if (uid) {
      await (supabase.rpc as any)("accept_required_legal_documents", {
        _version: REQUIRED_LEGAL_VERSION,
        _user_agent: navigator.userAgent.slice(0, 200),
      });
      await supabase.auth.updateUser({ data: acceptanceMeta });
    }
    setLoading(false);
    setShowTerms(false);
    toast.success("Account created!");
    nav({ to: "/onboarding" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-background px-6">
      <div className="mb-8 text-center">
        <img src={logo} alt="PullBid Live" className="mx-auto mb-4 h-64 w-64 object-contain drop-shadow-[0_10px_30px_oklch(0.72_0.17_165/0.35)]" />
        <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Welcome back" : "Create your account"}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Username (unique)" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} required minLength={3} />
            {username.length >= 3 && usernameOk !== null && (
              <p className={`mt-1 text-[11px] ${usernameOk ? "text-primary" : "text-destructive"}`}>
                {usernameOk ? `✓ @${username} is available` : `✗ @${username} is taken`}
              </p>
            )}
          </div>
        )}
        <input type="email" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== "forgot" && (
          <input type="password" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        )}
        {mode === "signup" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isSeller} onChange={(e) => setIsSeller(e.target.checked)} className="h-4 w-4" />
            I want to sell & host live auctions
          </label>
        )}
        {mode === "signup" && (
          <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3 text-[12px]">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>I confirm I am <strong>18 years or older</strong> (or the age of majority where I live).</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={tosOk} onChange={(e) => setTosOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>I agree to the <a href="/legal/tos" target="_blank" className="text-primary underline">Terms of Service</a> and <a href="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={guidelinesOk} onChange={(e) => setGuidelinesOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>I agree to follow the <a href="/legal/community-guidelines" target="_blank" className="text-primary underline">Community Guidelines</a>.</span>
            </label>
          </div>
        )}
        {mode === "forgot" && !resetSent && (
          <p className="text-center text-[12px] text-muted-foreground">
            Enter your account email and we'll send a secure password reset link.
          </p>
        )}
        {mode === "forgot" && resetSent && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-[12px] text-foreground">
            <p className="font-semibold text-primary">Check your inbox</p>
            <p className="mt-1 text-muted-foreground">
              If an account exists for <strong>{email}</strong>, you'll receive a
              reset link within a few minutes. Be sure to check your spam or
              promotions folder. The link expires after 1 hour.
            </p>
          </div>
        )}
        <Turnstile
          action={mode === "forgot" ? "password_reset" : mode}
          onVerify={(t) => { setCaptchaToken(t); setCaptchaUnavailable(false); }}
          onExpire={() => setCaptchaToken(null)}
          onUnavailable={() => setCaptchaUnavailable(true)}
          className="flex justify-center"
        />

        <button disabled={loading || (mode === "signup" && (usernameOk === false || !ageOk || !tosOk || !guidelinesOk))} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {loading ? "..." : mode === "signin" ? "Sign In" : mode === "forgot" ? "Send Reset Link" : "Review Buyer Terms & Sign Up"}
        </button>
        {mode === "signup" && (
          <p className="text-center text-[11px] text-muted-foreground">
            You'll be asked to review the{" "}
            <a href="/legal/buyer-terms" target="_blank" className="text-primary underline">Buyer Terms</a>,{" "}
            <a href="/legal/tos" target="_blank" className="text-primary underline">Terms of Service</a>, and{" "}
            <a href="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</a> before your account is created.
          </p>
        )}
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
      </div>

      <AuthPathBanner />

      <div className="space-y-2">
        <button type="button" disabled={loading} onClick={passkeyLogin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-3 text-sm font-semibold text-primary border border-primary/30 disabled:opacity-60">
          <Fingerprint className="h-4 w-4" /> Sign in with Face ID / Passkey
        </button>
        <button type="button" disabled={loading} onClick={() => oauth("google")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-card py-3 text-sm font-semibold border border-border disabled:opacity-60">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button type="button" disabled={loading} onClick={() => oauth("apple")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-card py-3 text-sm font-semibold border border-border disabled:opacity-60">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
      </div>

      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "Need an account? " : "Have an account? "}
        <span className="font-semibold text-primary">{mode === "signin" ? "Sign Up" : "Sign In"}</span>
      </button>
      {mode === "signin" && (
        <button onClick={() => setMode("forgot")} className="mt-2 text-center text-xs text-muted-foreground hover:text-primary">
          Forgot password?
        </button>
      )}
      {mode === "forgot" && (
        <button onClick={() => setMode("signin")} className="mt-2 text-center text-xs text-muted-foreground hover:text-primary">
          ← Back to sign in
        </button>
      )}
      <AgreementModal
        open={showTerms}
        required
        onDismiss={() => setShowTerms(false)}
        loading={loading}
        title="Buyer Terms & Conditions"
        subtitle="Required for everyone who bids, buys, or enters giveaways."
        agreeLabel="I have read and agree to the Buyer Terms, Terms of Service, and Privacy Policy."
        acceptLabel="Agree & Create Account"
        onAccept={completeSignup}
      >
        <p>By creating an account on PullBid Live, you agree to all of the following:</p>

        <h2>Binding Bids</h2>
        <ul>
          <li><strong>All bids are final and binding.</strong> Placing a bid is a legal commitment to purchase the item if you are the highest bidder when the auction ends.</li>
          <li>Winning a Buy-Now or Mystery Break slot is also a binding purchase.</li>
          <li>Bids cannot be retracted except in cases of clear seller misrepresentation, subject to Platform review.</li>
        </ul>

        <h2>Payment</h2>
        <ul>
          <li>You must complete payment for all won items within the cart payment window.</li>
          <li>Payment is processed via Stripe. By paying, you authorize the charge to your selected payment method.</li>
          <li>Failure to pay may result in items being relisted, account suspension, and forfeiture of related giveaway prizes.</li>
        </ul>

        <h2>No Chargeback Abuse</h2>
        <ul>
          <li>Chargebacks must only be filed for genuine unauthorized transactions.</li>
          <li>Filing a fraudulent chargeback (e.g. "item not received" after delivery confirmation) is grounds for permanent ban.</li>
          <li>Item-quality disputes must go through the in-app dispute system <strong>before</strong> any chargeback.</li>
        </ul>

        <h2>Conduct</h2>
        <ul>
          <li>No fraud, scams, or fake listings.</li>
          <li>Follow chat slow-mode and host rules. No spam or harassment.</li>
          <li>You are responsible for your own transactions; the Platform is not liable for disputes between users.</li>
        </ul>

        <h2>Privacy</h2>
        <ul>
          <li>We collect your account info, payment info (via Stripe), and platform activity to operate the service.</li>
          <li>We never sell your personal data. Full details: <a href="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>.</li>
        </ul>

        <h2>Violations</h2>
        <p>Breaking these rules can result in warnings, suspension, or permanent ban at the Platform's sole discretion.</p>

        <p className="mt-3 text-xs text-muted-foreground">
          Full documents: <a href="/legal/tos" target="_blank" className="text-primary underline">Terms of Service</a> ·{" "}
          <a href="/legal/buyer-terms" target="_blank" className="text-primary underline">Buyer Terms</a> ·{" "}
          <a href="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>
        </p>
      </AgreementModal>
    </div>
  );
}
