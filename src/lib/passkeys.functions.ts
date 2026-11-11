import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ username: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const { passkeyOrigin, saveChallenge } = await import("./passkeyChallenges.server");
    const { rpID } = passkeyOrigin();
    const { data: existing, error } = await context.supabase.from("webauthn_credentials")
      .select("credential_id").eq("user_id", context.userId);
    if (error) throw error;
    const options = await generateRegistrationOptions({
      rpName: "PullBid Live", rpID, userName: data.username,
      userID: new TextEncoder().encode(context.userId), attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: (existing || []).map((c) => ({ id: c.credential_id })),
    });
    const challengeKey = await saveChallenge(options.challenge, "registration", context.userId);
    return { options, challengeKey };
  });

export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ response: z.any(), challengeKey: z.string().uuid(), label: z.string().max(100).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { consumeChallenge } = await import("./passkeyChallenges.server");
    const challenge = await consumeChallenge(data.challengeKey, "registration", context.userId);
    const verification = await verifyRegistrationResponse({
      response: data.response, expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin, expectedRPID: challenge.rpID, requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey verification failed");
    const { credential } = verification.registrationInfo;
    const publicKey = btoa(Array.from(credential.publicKey, (byte) => String.fromCharCode(byte)).join(""));
    const { error } = await context.supabase.from("webauthn_credentials").insert({
      user_id: context.userId, credential_id: credential.id, public_key: publicKey,
      counter: credential.counter, transports: (data.response.response?.transports || []).join(","),
      label: data.label || "Passkey",
    });
    if (error) throw error;
    return { ok: true };
  });

export const startPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ username: z.string().max(100).optional() }).parse(input))
  .handler(async () => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const { passkeyOrigin, saveChallenge } = await import("./passkeyChallenges.server");
    const { rpID } = passkeyOrigin();
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    return { options, challengeKey: await saveChallenge(options.challenge, "authentication", null) };
  });

export const finishPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ response: z.any(), challengeKey: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { consumeChallenge } = await import("./passkeyChallenges.server");
    const challenge = await consumeChallenge(data.challengeKey, "authentication");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cred, error: lookupError } = await supabaseAdmin.from("webauthn_credentials")
      .select("*").eq("credential_id", data.response.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!cred) throw new Error("No account matches this passkey. Add one in your profile first.");
    const verification = await verifyAuthenticationResponse({
      response: data.response, expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin, expectedRPID: challenge.rpID, requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: Uint8Array.from(atob(cred.public_key), (char) => char.charCodeAt(0)),
        counter: Number(cred.counter || 0),
      },
    });
    if (!verification.verified) throw new Error("Passkey verification failed");
    const { error: counterError } = await supabaseAdmin.from("webauthn_credentials")
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("credential_id", cred.credential_id);
    if (counterError) throw counterError;
    const { data: userRes, error: userError } = await supabaseAdmin.auth.admin.getUserById(cred.user_id);
    if (userError) throw userError;
    const email = userRes.user?.email;
    if (!email || !userRes.user?.email_confirmed_at) throw new Error("Confirm your email before using a passkey");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const hashed_token = link.properties?.hashed_token;
    if (!hashed_token) throw new Error("Could not create a sign-in session");
    return { hashed_token };
  });

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ username: z.string().min(3).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("profiles")
      .select("id").eq("username", data.username).maybeSingle();
    if (error) throw error;
    return { available: !row };
  });