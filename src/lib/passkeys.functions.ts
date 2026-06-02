import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RP_NAME = "Pull Bid Live";

function rpFromOrigin() {
  const origin = getRequestHeader("origin") || getRequestHeader("referer") || "";
  try {
    const u = new URL(origin);
    return { rpID: u.hostname, origin: u.origin };
  } catch {
    return { rpID: "localhost", origin: "http://localhost" };
  }
}

// In-memory challenge store (per-deployment). Acceptable for low-volume.
const challenges = new Map<string, { challenge: string; ts: number }>();
function setChallenge(key: string, challenge: string) {
  challenges.set(key, { challenge, ts: Date.now() });
  // gc
  for (const [k, v] of challenges) if (Date.now() - v.ts > 5 * 60_000) challenges.delete(k);
}
function takeChallenge(key: string) {
  const v = challenges.get(key); challenges.delete(key); return v?.challenge;
}

export const startPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { rpID } = rpFromOrigin();
    const { data: existing } = await supabaseAdmin
      .from("webauthn_credentials").select("credential_id,transports").eq("user_id", userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID,
      userName: data.username, userID: new TextEncoder().encode(userId),
      attestationType: "none",
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      excludeCredentials: (existing || []).map((c: any) => ({ id: c.credential_id })),
    });
    setChallenge(`reg:${userId}`, options.challenge);
    return options;
  });

export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { response: any; label?: string }) => d)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { rpID, origin } = rpFromOrigin();
    const expectedChallenge = takeChallenge(`reg:${userId}`);
    if (!expectedChallenge) throw new Error("Challenge expired");
    const verification = await verifyRegistrationResponse({
      response: data.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("Verification failed");
    const { credential } = verification.registrationInfo as any;
    const credentialID: string = credential.id;
    const publicKey: Uint8Array = credential.publicKey;
    const counter: number = credential.counter ?? 0;
    const pkB64 = Buffer.from(publicKey).toString("base64");
    await supabaseAdmin.from("webauthn_credentials").insert({
      user_id: userId, credential_id: credentialID, public_key: pkB64,
      counter, transports: (data.response.response?.transports || []).join(","),
      label: data.label || "Passkey",
    });
    return { ok: true };
  });

export const startPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username?: string }) => d)
  .handler(async ({ data }) => {
    const { rpID } = rpFromOrigin();
    let allow: { id: string }[] = [];
    let userId: string | null = null;
    if (data.username) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("id").ilike("username", data.username).maybeSingle();
      if (prof) {
        userId = prof.id;
        const { data: creds } = await supabaseAdmin
          .from("webauthn_credentials").select("credential_id").eq("user_id", prof.id);
        allow = (creds || []).map((c) => ({ id: c.credential_id }));
      }
    }
    const options = await generateAuthenticationOptions({
      rpID, userVerification: "preferred",
      allowCredentials: allow.length ? allow : undefined,
    });
    setChallenge(`auth:${userId || "any"}:${options.challenge.slice(0, 8)}`, options.challenge);
    return { options, challengeKey: `auth:${userId || "any"}:${options.challenge.slice(0, 8)}` };
  });

export const finishPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { response: any; challengeKey: string }) => d)
  .handler(async ({ data }) => {
    const { rpID, origin } = rpFromOrigin();
    const expectedChallenge = takeChallenge(data.challengeKey);
    if (!expectedChallenge) throw new Error("Challenge expired");
    const credId: string = data.response.id;
    const { data: cred } = await supabaseAdmin
      .from("webauthn_credentials").select("*").eq("credential_id", credId).maybeSingle();
    if (!cred) throw new Error("Unknown credential");
    const verification = await verifyAuthenticationResponse({
      response: data.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64")),
        counter: Number(cred.counter || 0),
      },
    });
    if (!verification.verified) throw new Error("Verification failed");
    await supabaseAdmin.from("webauthn_credentials")
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("credential_id", credId);

    // Mint a Supabase session via admin: generate a magic link token then exchange
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("id", cred.user_id).maybeSingle();
    if (!prof) throw new Error("User not found");
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(cred.user_id);
    const email = userRes.user?.email;
    if (!email) throw new Error("No email on user");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", email,
    });
    if (error) throw error;
    // Extract the hashed token from the action link
    const hashed_token = (link.properties as any)?.hashed_token;
    if (!hashed_token) throw new Error("Could not generate session");
    return { hashed_token, email };
  });

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles").select("id").ilike("username", data.username).maybeSingle();
    return { available: !row };
  });
