import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

/**
 * AchievementToastListener — subscribes to user_achievements inserts for
 * the signed-in user and renders a celebratory toast. Looks up the
 * achievement title from the catalog. Mount once at app shell level.
 */
export function AchievementToastListener() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`achievements-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "user_achievements", filter: `user_id=eq.${user.id}` },
        async (p: any) => {
          const ach = p.new?.achievement_id;
          if (!ach) return;
          const { data } = await supabase.from("achievements" as any).select("title,description,xp_reward").eq("id", ach).maybeSingle();
          const a = data as any;
          if (!a) return;
          toast.success(
            `🏆 ${a.title}`,
            { description: `${a.description} (+${a.xp_reward} XP)`, duration: 6000, icon: <Trophy className="h-4 w-4" /> as any },
          );
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return null;
}

/**
 * LevelUpListener — subscribes to xp_events for the signed-in user
 * and toasts when their level changes (compares old vs new progression).
 */
export function LevelUpListener() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    let prevLevel: number | null = null;
    (async () => {
      const { data } = await supabase.from("user_progression" as any).select("level").eq("user_id", user.id).maybeSingle();
      prevLevel = (data as any)?.level ?? 1;
    })();
    const ch = supabase
      .channel(`levelup-${user.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_progression", filter: `user_id=eq.${user.id}` },
        (p: any) => {
          const newLevel = p.new?.level;
          if (prevLevel !== null && newLevel > prevLevel) {
            toast.success(`✨ Level up! You reached Lv ${newLevel}`, { duration: 5000 });
          }
          prevLevel = newLevel;
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);
  return null;
}
