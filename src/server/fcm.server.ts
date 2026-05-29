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

export type NativeTokenResult = {
  token: string;
  ok: boolean;
  invalid: boolean;
  status?: number;
  /** Short machine-readable reason, e.g. "UNREGISTERED", "QUOTA_EXCEEDED", "HTTP_503". */
  reason?: string;
  /** Human-readable detail from the FCM/APNs error response. */
  detail?: string;
};

/** Extracts a concise FCM error reason + detail from a v1 API error body. */
function parseFcmError(status: number, errText: string): { reason: string; detail: string } {
  let reason = `HTTP_${status}`;
  let detail = errText.slice(0, 500);
  try {
    const json = JSON.parse(errText);
    const err = json?.error;
    if (err) {
      detail = err.message || detail;
      // FCM v1 surfaces the canonical reason under error.details[].errorCode
      const fcmDetail = Array.isArray(err.details)
        ? err.details.find((d: any) => d?.errorCode)
        : null;
      reason = fcmDetail?.errorCode || err.status || reason;
    }
  } catch {
    // Non-JSON body — fall back to regex sniffing for known codes.
    const m = errText.match(/UNREGISTERED|INVALID_ARGUMENT|QUOTA_EXCEEDED|UNAVAILABLE|SENDER_ID_MISMATCH|THIRD_PARTY_AUTH_ERROR/);
    if (m) reason = m[0];
  }
  return { reason, detail };
}

/**
 * Sends a native push to the given FCM device tokens. Returns aggregate counts,
 * the tokens that are no longer valid (UNREGISTERED / INVALID_ARGUMENT) so
 * callers can clean up their subscription rows, and per-token diagnostics
 * (status, reason, detail) so callers can persist delivery diagnostics.
 */
export async function sendNativePush(
  tokens: string[],
  payload: NativePayload,
): Promise<{ sent: number; invalidTokens: string[]; results: NativeTokenResult[] }> {
  const result = { sent: 0, invalidTokens: [] as string[], results: [] as NativeTokenResult[] };
  if (tokens.length === 0) return result;

  const sa = getServiceAccount();
  if (!sa) {
    result.results = tokens.map((token) => ({
      token, ok: false, invalid: false, reason: "FCM_NOT_CONFIGURED",
      detail: "FCM_SERVICE_ACCOUNT secret is missing or invalid.",
    }));
    return result;
  }
  const accessToken = await getAccessToken(sa);
  if (!accessToken) {
    result.results = tokens.map((token) => ({
      token, ok: false, invalid: false, reason: "FCM_AUTH_FAILED",
      detail: "Could not obtain an FCM OAuth access token.",
    }));
    return result;
  }

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
          result.results.push({ token, ok: true, invalid: false, status: res.status });
        } else {
          const errText = await res.text();
          const { reason, detail } = parseFcmError(res.status, errText);
          const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(`${reason} ${errText}`);
          if (invalid) {
            result.invalidTokens.push(token);
          } else {
            console.warn("FCM send failed:", res.status, reason, detail);
          }
          result.results.push({ token, ok: false, invalid, status: res.status, reason, detail });
        }
      } catch (e) {
        const detail = (e as Error)?.message || "Network error";
        console.warn("FCM send error:", detail);
        result.results.push({ token, ok: false, invalid: false, reason: "NETWORK_ERROR", detail });
      }
    }),
  );

  return result;
}

