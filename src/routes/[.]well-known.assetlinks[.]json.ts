import { createFileRoute } from "@tanstack/react-router";

/**
 * Android Digital Asset Links (App Links) file.
 *
 * Served from https://pullbidlive.com/.well-known/assetlinks.json so Android can
 * verify the app owns the domain and route App Links (including the OAuth return
 * URL) back into the native app instead of the system browser.
 *
 * Requires the matching autoVerify intent-filter in the Android project for
 * https://pullbidlive.com. The SHA-256 fingerprint below is the Play
 * app-signing certificate fingerprint.
 */
const ASSET_LINKS = [
  {
    relation: [
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds",
    ],
    target: {
      namespace: "android_app",
      package_name: "com.pullbidlive.app",
      sha256_cert_fingerprints: [
        "15:2D:5D:2C:89:75:1F:CD:62:90:10:D0:16:EB:D4:AD:D2:30:C1:DD:50:8E:E7:E3:C3:93:B3:05:05:E4:99:A6",
      ],
    },
  },
];

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(ASSET_LINKS), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
