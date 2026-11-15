/** AES-256-GCM token encryption (Web Crypto; works on Workers). Format: v1.<iv b64>.<ciphertext b64> */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error("Token encryption key is missing or too short.");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function encryptToken(plain: string, key: CryptoKey, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function decryptToken(blob: string, key: CryptoKey, aad: string): Promise<string> {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unrecognized token format.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(aad) }, key, unb64(ct));
  return dec.decode(pt);
}
