import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for PullBidLive native iOS/Android wrappers.
 *
 * Two modes:
 *  - Local build (App Store / Play Store submission): leave `server` unset
 *    so the native app loads the bundled `dist/` web build offline-first.
 *  - Live-reload dev: set CAP_SERVER_URL=https://<your-lovable-preview>.lovable.app
 *    before running `bunx cap sync` to point the native shell at the hosted preview.
 *
 * See CAPACITOR.md at the repo root for the full build / submit workflow.
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.pullbidlive.app",
  appName: "PullBid Live",
  webDir: "dist",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
        },
      }
    : {}),
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
