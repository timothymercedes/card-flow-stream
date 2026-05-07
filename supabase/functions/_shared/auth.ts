// Shared auth helper for edge functions.
// Verifies the caller's Supabase JWT and optionally checks for an admin/owner role.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthOk = { ok: true; userId: string; token: string };
export type AuthFail = { ok: false; status: number; error: string };

export async function verifyUser(req: Request): Promise<AuthOk | AuthFail> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization bearer token" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: "Empty bearer token" };

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    if (!r.ok) return { ok: false, status: 401, error: "Invalid or expired token" };
    const u = await r.json();
    if (!u?.id) return { ok: false, status: 401, error: "No user for token" };
    return { ok: true, userId: u.id, token };
  } catch {
    return { ok: false, status: 401, error: "Auth verification failed" };
  }
}

export async function userHasAdminRole(userId: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&role=in.(admin,owner)&select=role`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
