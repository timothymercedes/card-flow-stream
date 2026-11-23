// Signed, HttpOnly beta-access token. Browsers can't forge it; invite tokens are rechecked on every status read.
const enc = new TextEncoder();
export const BETA_TOKEN_COOKIE = "pbl_beta_t";
const MAX_AGE = 60 * 60 * 24 * 30;

function key() {
  const s = process.env.BETA_PASSWORD || "";
  if (!s) return null;
  return crypto.subtle.importKey("raw", enc.encode("beta-token:" + s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export type BetaClaim = { via: "password" | "code"; inviteId?: string; exp: number };

export async function signBetaCookie(claim: Omit<BetaClaim, "exp">): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const payload = b64(enc.encode(JSON.stringify({ ...claim, exp: Math.floor(Date.now() / 1000) + MAX_AGE })));
  const sig = b64(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return `${BETA_TOKEN_COOKIE}=${payload}.${sig}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=None`;
}

export async function readBetaClaim(request: Request): Promise<BetaClaim | null> {
  const raw = (request.headers.get("cookie") || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(BETA_TOKEN_COOKIE + "="));
  if (!raw) return null;
  const [payload, sig] = raw.slice(BETA_TOKEN_COOKIE.length + 1).split(".");
  const k = await key();
  if (!k || !payload || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", k, unb64(sig), enc.encode(payload)))) return null;
    const claim = JSON.parse(new TextDecoder().decode(unb64(payload))) as BetaClaim;
    if (!claim.exp || claim.exp < Date.now() / 1000) return null;
    return claim;
  } catch { return null; }
}
