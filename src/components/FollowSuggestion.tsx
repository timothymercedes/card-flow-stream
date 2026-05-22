/**
 * FollowSuggestion — renders a FollowButton only when the current user is not
 * already following the target user. Hides itself for self, guests can still
 * see the prompt (FollowButton handles the auth gate).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FollowButton } from "@/components/FollowButton";

export function FollowSuggestion({
  userId,
  size = "sm",
  className = "",
}: {
  userId?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const { user } = useAuth();
  const [checked, setChecked] = useState(false);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    if (!user) { setChecked(true); setFollowing(false); return; }
    if (user.id === userId) { setChecked(true); setFollowing(true); return; }
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("followee_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setFollowing(!!data);
        setChecked(true);
      });
    return () => { cancelled = true; };
  }, [user?.id, userId]);

  if (!userId) return null;
  if (!checked) return null;
  if (following) return null;

  return (
    <FollowButton
      userId={userId}
      size={size}
      className={className}
      onChange={(f) => setFollowing(f)}
    />
  );
}
