export type EndingWindow = "1h" | "10m";
/** Which warning (if any) is due for an auction ending at `endsAt`. Windows are wide enough for a 5-minute schedule. */
export function dueWindow(endsAt: string, now = Date.now()): EndingWindow | null {
  const mins = (new Date(endsAt).getTime() - now) / 60000;
  if (mins > 0 && mins <= 12) return "10m";
  if (mins > 50 && mins <= 65) return "1h";
  return null;
}
