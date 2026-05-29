import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for PullBidLive native iOS/Android wrappers.
 *
 * This app is a server-rendered (SSR) TanStack Start app, so the web build does
 * NOT produce a static index.html that Capacitor can bundle offline. Instead the
 * native app is a thin shell that loads the hosted web app over the network via
 * `server.url`. `capacitor-shell/index.html` is a small placeholder shown while
 * the WebView connects (it satisfies Capacitor's required webDir/index.html).
 *
 *  - Production (App Store / Play Store): defaults to https://pullbidlive.com
 *  - Override the target by setting CAP_SERVER_URL before `bunx cap sync`
 *    (e.g. a Lovable preview URL for live testing).
 *
 * See CAPACITOR.md at the repo root for the full build / submit workflow.
 */
const serverUrl = process.env.CAP_SERVER_URL || "https://pullbidlive.com";

const config: CapacitorConfig = {
  appId: "com.pullbidlive.app",
  appName: "PullBid Live",
  webDir: "capacitor-shell",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#0a0a0a",
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      // Permissions strings are declared in iOS Info.plist / Android manifest.
    },
  },
};

export default config;
