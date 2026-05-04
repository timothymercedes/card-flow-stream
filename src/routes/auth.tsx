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

export const Route = createFileRoute("/auth")({ component: Auth });

function Auth() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameOk, setUsernameOk] = useState<null | boolean>(null);
  const [isSeller, setIsSeller] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav({ to: "/" }); }, [user, nav]);

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
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (result.error) toast.error("Sign-in failed");
    else if (!result.redirected) nav({ to: "/" });
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
      nav({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message || "Passkey sign-in failed");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "signup") {
      if (!acceptedTerms) { setLoading(false); return toast.error("You must accept the Terms & Privacy Policy"); }
      if (usernameOk === false) { setLoading(false); return toast.error("Username already taken"); }
      const { data: signupData, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { username, is_seller: isSeller } },
      });
      if (error) { toast.error(error.message); }
      else {
        // Record legal acceptances
        const uid = signupData.user?.id;
        if (uid) {
          await supabase.from("legal_acceptances").insert([
            { user_id: uid, document_type: "tos", version: "1.0", user_agent: navigator.userAgent.slice(0, 200) },
            { user_id: uid, document_type: "privacy", version: "1.0", user_agent: navigator.userAgent.slice(0, 200) },
            { user_id: uid, document_type: "buyer_terms", version: "1.0", user_agent: navigator.userAgent.slice(0, 200) },
          ]);
        }
        toast.success("Account created!"); nav({ to: "/" });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message); else nav({ to: "/" });
    }
    setLoading(false);
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
        <input type="password" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {mode === "signup" && (
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={isSeller} onChange={(e) => setIsSeller(e.target.checked)} className="h-4 w-4" />
              I want to sell & host live auctions
            </label>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                I agree to the{" "}
                <a href="/legal/tos" target="_blank" className="font-semibold text-primary underline">Terms of Service</a>,{" "}
                <a href="/legal/buyer-terms" target="_blank" className="font-semibold text-primary underline">Buyer Terms</a>, and{" "}
                <a href="/legal/privacy" target="_blank" className="font-semibold text-primary underline">Privacy Policy</a>.
              </span>
            </label>
          </>
        )}
        <button disabled={loading || (mode === "signup" && (usernameOk === false || !acceptedTerms))} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {loading ? "..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <button onClick={passkeyLogin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-3 text-sm font-semibold text-primary border border-primary/30">
          <Fingerprint className="h-4 w-4" /> Sign in with Face ID / Passkey
        </button>
        <button onClick={() => oauth("google")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-card py-3 text-sm font-semibold border border-border">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button onClick={() => oauth("apple")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-card py-3 text-sm font-semibold border border-border">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
      </div>

      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "Need an account? " : "Have an account? "}
        <span className="font-semibold text-primary">{mode === "signin" ? "Sign Up" : "Sign In"}</span>
      </button>
    </div>
  );
}
