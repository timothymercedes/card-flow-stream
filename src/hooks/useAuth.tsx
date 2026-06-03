import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TUTORIAL_DEMO_USER, useTutorialMode } from "@/lib/tutorialMode";
import type { Session, User } from "@supabase/supabase-js";

type Profile = { id: string; username: string; is_seller: boolean; avatar_url: string | null; interests?: string[]; onboarding_completed?: boolean; current_streak?: number; longest_streak?: number; last_login_date?: string | null };

type Ctx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          // Bump daily login streak (no-op if already today)
          try { await (supabase.rpc as any)("bump_login_streak"); } catch {}
          const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
          setProfile(data as Profile | null);
        }, 0);
      } else {
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const tutorial = useTutorialMode();
  const effectiveUser = (tutorial && !user) ? ({ id: TUTORIAL_DEMO_USER.id, email: TUTORIAL_DEMO_USER.email } as unknown as User) : user;
  const effectiveProfile = (tutorial && !profile) ? (TUTORIAL_DEMO_USER as unknown as Profile) : profile;

  return (
    <AuthContext.Provider value={{ user: effectiveUser, session, profile: effectiveProfile, loading, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
