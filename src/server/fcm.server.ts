// Server-only helper: deliver native push via Firebase Cloud Messaging (FCM)
// HTTP v1 API. This covers both Android and iOS Capacitor builds that register
// through Firebase Messaging. We sign a short-lived OAuth2 access token from the
// service-account JSON using Web Crypto (works in the Cloudflare Workers runtime).
//
// Requires the FCM_SERVICE_ACCOUNT secret: the full service-account JSON
// (Firebase console → Project settings → Service accounts → Generate new key).

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type NativePayload = { title: string; body: string; url?: string; tag?: string };

let cachedToken: { token: string; exp: number } | null = null;
let cachedSA: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount | null {
  if (cachedSA) return cachedSA;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    cachedSA = sa;
    return sa;
  } catch {
    console.warn("FCM_SERVICE_ACCOUNT is not valid JSON — native push disabled");
    return null;
  }
}

function base64url(input: ArrayBuffer | string): string {
  let str: string;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    str = btoa(bin);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  try {
    const header = { alg: "RS256", typ: "JWT" };
    const claim = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(sa.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    );
    const jwt = `${unsigned}.${base64url(sig)}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      console.warn("FCM token exchange failed:", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
    return cachedToken.token;
  } catch (e) {
    console.warn("FCM access token error:", (e as Error)?.message);
    return null;
  }
}

/**
 * Sends a native push to the given FCM device tokens. Returns the tokens that
 * are no longer valid (UNREGISTERED / INVALID_ARGUMENT) so callers can clean
 * up their subscription rows.
 */
export async function sendNativePush(
  tokens: string[],
  payload: NativePayload,
): Promise<{ sent: number; invalidTokens: string[] }> {
  const result = { sent: 0, invalidTokens: [] as string[] };
  if (tokens.length === 0) return result;

  const sa = getServiceAccount();
  if (!sa) return result;
  const accessToken = await getAccessToken(sa);
  if (!accessToken) return result;

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const message: Record<string, unknown> = {
          token,
          notification: { title: payload.title, body: payload.body },
          data: {
            ...(payload.url ? { url: payload.url, link: payload.url } : {}),
            ...(payload.tag ? { tag: payload.tag } : {}),
          },
          android: {
            priority: "high",
            notification: { sound: "default", default_vibrate_timings: true },
          },
          apns: {
            headers: { "apns-priority": "10", "apns-push-type": "alert" },
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                "mutable-content": 1,
              },
            },
          },

        };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });
        if (res.ok) {
          result.sent++;
        } else {
          const errText = await res.text();
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(errText)) {
            result.invalidTokens.push(token);
          } else {
            console.warn("FCM send failed:", res.status, errText);
          }
        }
      } catch (e) {
        console.warn("FCM send error:", (e as Error)?.message);
      }
    }),
  );

  return result;
}
