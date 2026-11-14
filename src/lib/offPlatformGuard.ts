import { toast } from "sonner";
import { detectOffPlatform } from "@/lib/offPlatform";

export const OFF_PLATFORM_BLOCK_MSG = "For buyer and seller protection, payments must stay on PullBid Live. External payment handles, links, or requests to skip checkout aren't allowed.";
export const OFF_PLATFORM_WARN_MSG = "This looks like it may involve paying or contacting outside PullBid Live. Off-platform deals lose buyer/seller protection, insurance and support. Local pickup is fine when paid through PullBid Live checkout. Send anyway?";

export type GuardAction = "allow" | "warn" | "block";
export function offPlatformAction(...texts: (string | null | undefined)[]): GuardAction {
  let worst: GuardAction = "allow";
  for (const t of texts) {
    const r = detectOffPlatform(t ?? "").risk;
    if (r === "high") return "block";
    if (r === "medium") worst = "warn";
  }
  return worst;
}

/** Browser check: blocks high risk, asks for acknowledgment on medium. Returns true to proceed. */
export function confirmOffPlatform(...texts: (string | null | undefined)[]): boolean {
  const a = offPlatformAction(...texts);
  if (a === "block") { toast.error(OFF_PLATFORM_BLOCK_MSG); return false; }
  if (a === "warn") return typeof window !== "undefined" && window.confirm(OFF_PLATFORM_WARN_MSG);
  return true;
}
