import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Progression = {
  user_id: string;
  xp: number;
  lifetime_xp: number;
  level: number;
  login_streak: number;
  longest_login_streak: number;
  watch_streak: number;
  last_login_date: string | null;
};

/**
 * useProgression — fetches the signed-in user's progression row and keeps
 * it live via realtime on user_progression. Returns null if signed out.
 */
export function useProgression() {
  const { user } = useAuth();
  const [data, setData] = useState<Progression | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setData(null); setLoading(false); return; }
    const { data: row } = await supabase
      .from("user_progression" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setData((row as any) || { user_id: user.id, xp: 0, lifetime_xp: 0, level: 1, login_streak: 0, longest_login_streak: 0, watch_streak: 0, last_login_date: null });
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`progression-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "user_progression", filter: `user_id=eq.${user.id}` },
      () => refresh(),
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  return { progression: data, loading, refresh };
}
