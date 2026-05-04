import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: Auth });

function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { username, is_seller: isSeller } },
      });
      if (error) toast.error(error.message); else { toast.success("Account created!"); nav({ to: "/" }); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message); else nav({ to: "/" });
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-background px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">P</div>
        <h1 className="text-2xl font-bold">PULL BID <span className="text-live">LIVE</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Welcome back" : "Create your account"}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        )}
        <input type="email" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" className="w-full rounded-xl bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {mode === "signup" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isSeller} onChange={(e) => setIsSeller(e.target.checked)} className="h-4 w-4" />
            I want to sell & host live auctions
          </label>
        )}
        <button disabled={loading} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {loading ? "..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "Need an account? " : "Have an account? "}
        <span className="font-semibold text-primary">{mode === "signin" ? "Sign Up" : "Sign In"}</span>
      </button>
    </div>
  );
}
