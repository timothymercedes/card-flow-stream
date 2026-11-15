/** Persistent encrypted CJ token store. Server-only: uses the trusted backend client; the key lives only in a backend secret. */
import { decryptToken, deriveKey, encryptToken } from "./tokenCrypto";
import type { StoredTokens, TokenStore } from "./cjAdapter.server";

export async function createSupabaseTokenStore(kind = "cj"): Promise<TokenStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const key = await deriveKey(process.env.CJ_TOKEN_ENCRYPTION_KEY ?? "");
  const { data: sup, error } = await db.from("bazaar_suppliers").select("id").eq("kind", kind).maybeSingle();
  if (error || !sup) throw new Error("Supplier is not registered.");
  const id = sup.id;
  return {
    async load() {
      const { data } = await db.from("bazaar_supplier_credentials").select("access_token_ciphertext,refresh_token_ciphertext,access_expires_at,refresh_expires_at").eq("supplier_id", id).maybeSingle();
      if (!data?.access_token_ciphertext || !data.refresh_token_ciphertext || !data.access_expires_at || !data.refresh_expires_at) return null;
      try {
        return { access: await decryptToken(data.access_token_ciphertext, key, `${id}:access`), refresh: await decryptToken(data.refresh_token_ciphertext, key, `${id}:refresh`), accessExp: Date.parse(data.access_expires_at), refreshExp: Date.parse(data.refresh_expires_at) };
      } catch { return null; } // wrong key or tampered: treat as missing and sign in again
    },
    async claim(owner) { const { data, error: e } = await db.rpc("bazaar_claim_credential_refresh", { _supplier: id, _owner: owner, _ttl_seconds: 30 }); if (e) throw new Error("Couldn't lock token refresh."); return !!data; },
    async save(owner, t: StoredTokens, via) {
      const { data, error: e } = await db.rpc("bazaar_store_credential_tokens", { _supplier: id, _owner: owner, _access: await encryptToken(t.access, key, `${id}:access`), _refresh: await encryptToken(t.refresh, key, `${id}:refresh`), _access_exp: new Date(t.accessExp).toISOString(), _refresh_exp: new Date(t.refreshExp).toISOString(), _via: via === "login" ? "login" : "refresh", _key_version: 1 });
      if (e) throw new Error("Couldn't save tokens."); return !!data;
    },
  };
}
