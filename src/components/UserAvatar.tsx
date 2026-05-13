/**
 * UserAvatar — reusable avatar with optional LIVE ring + click-through.
 *
 *  - Shows a pulsing red ring + "LIVE" pill when `isLive` is true
 *  - Clicking the avatar:
 *      • when live → goes straight to /live/$liveStreamId
 *      • otherwise → goes to /seller/$username
 *  - Falls back to initials when no avatar_url
 *
 * Designed to be drop-in anywhere a user is shown (chat, bidder, winners,
 * followers, etc.) so live status is consistently surfaced platform-wide.
 */
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { xs: 24, sm: 32, md: 40, lg: 56 };

export function UserAvatar({
  username,
  avatarUrl,
  isLive = false,
  liveStreamId,
  size = "sm",
  className = "",
  noLink = false,
  ariaLabel,
}: {
  username?: string | null;
  avatarUrl?: string | null;
  isLive?: boolean;
  liveStreamId?: string | null;
  size?: Size;
  className?: string;
  noLink?: boolean;
  ariaLabel?: string;
}) {
  const px = SIZE_PX[size];
  const initial = (username || "?").trim().charAt(0).toUpperCase();

  const inner = (
    <div
      className={`relative inline-flex items-center justify-center overflow-visible rounded-full ${className}`}
      style={{ width: px, height: px }}
    >
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-muted ${
          isLive ? "ring-2 ring-live ring-offset-1 ring-offset-background animate-pulse-soft" : ""
        }`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : username ? (
          <span className="text-[10px] font-bold text-muted-foreground">{initial}</span>
        ) : (
          <User className="h-1/2 w-1/2 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      {isLive && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-live px-1 py-px text-[8px] font-bold leading-none text-live-foreground shadow"
          style={{ fontSize: Math.max(7, px * 0.18) }}
        >
          LIVE
        </span>
      )}
    </div>
  );

  if (noLink || !username) return inner;

  if (isLive && liveStreamId) {
    return (
      <Link
        to="/live/$id"
        params={{ id: liveStreamId }}
        aria-label={ariaLabel || `Join @${username}'s live stream`}
        className="inline-flex"
      >
        {inner}
      </Link>
    );
  }

  return (
    <Link
      to="/seller/$username"
      params={{ username }}
      aria-label={ariaLabel || `Open @${username}'s profile`}
      className="inline-flex"
    >
      {inner}
    </Link>
  );
}
