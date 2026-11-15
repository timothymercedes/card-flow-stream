// Pure helpers that decide whether an anonymous (signed-out) viewer may open
// a Cloudflare Calls session. Kept free of Deno APIs so they can be unit tested.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidStreamId(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id);
}

export type LiveStreamLookup = (streamId: string) => Promise<{ status?: string | null; is_active?: boolean | null } | null>;

/**
 * Anonymous viewers must name a stream that is currently live. Anything else
 * (missing id, malformed id, ended/scheduled stream, lookup failure) is refused
 * so outsiders cannot mint billable sessions.
 */
export async function anonymousViewerAllowed(streamId: string | null | undefined, lookup: LiveStreamLookup): Promise<boolean> {
  if (!isValidStreamId(streamId)) return false;
  try {
    const row = await lookup(streamId);
    if (!row) return false;
    return row.status === "live" || row.is_active === true;
  } catch {
    return false;
  }
}
