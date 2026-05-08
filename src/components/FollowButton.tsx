import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  size?: "sm" | "md";
  className?: string;
  onChange?: (following: boolean) => void;
}

export function FollowButton({ userId, size = "sm", className = "", onChange }: Props) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.id === userId) return;
    supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followee_id", userId).maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [user?.id, userId]);

  if (!user || user.id === userId) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    if (following) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", userId);
      if (!error) { setFollowing(false); onChange?.(false); }
      else toast.error("Couldn't unfollow");
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: user.id, followee_id: userId });
      if (!error) { setFollowing(true); onChange?.(true); }
      else toast.error("Couldn't follow");
    }
    setLoading(false);
  };

  const sizeCls = size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-9 px-3 text-xs";
  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1 rounded-full font-bold transition-all disabled:opacity-50 ${sizeCls} ${
        following ? "bg-muted text-foreground hover:bg-muted/80" : "bg-primary text-primary-foreground hover:bg-primary/90"
      } ${className}`}
    >
      {following ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
