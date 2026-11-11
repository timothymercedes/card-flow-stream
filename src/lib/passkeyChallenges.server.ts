import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function passkeyOrigin() {
  const value = getRequestHeader("origin") || getRequestHeader("referer");
  if (!value) throw new Error("Passkeys require a browser origin");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Passkeys require a secure connection");
  }
  return { rpID: url.hostname, origin: url.origin };
}

export async function saveChallenge(challenge: string, purpose: "registration" | "authentication", userId: string | null) {
  const { origin, rpID } = passkeyOrigin();
  const { error: cleanupError } = await supabaseAdmin.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
  if (cleanupError) throw cleanupError;
  const { data, error } = await supabaseAdmin.from("webauthn_challenges").insert({
    challenge, purpose, user_id: userId, origin, rp_id: rpID,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function consumeChallenge(id: string, purpose: "registration" | "authentication", userId?: string) {
  const { origin, rpID } = passkeyOrigin();
  let query = supabaseAdmin.from("webauthn_challenges").delete()
    .eq("id", id).eq("purpose", purpose).eq("origin", origin).eq("rp_id", rpID)
    .gt("expires_at", new Date().toISOString());
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.select("challenge,user_id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Passkey challenge expired or already used. Please try again.");
  return { ...data, origin, rpID };
}