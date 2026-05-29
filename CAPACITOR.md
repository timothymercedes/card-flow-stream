# PullBid Live — Native iOS & Android (Capacitor)

This project ships as a mobile-first PWA **and** as native iOS / Android apps
via [Capacitor](https://capacitorjs.com). The web build under `dist/` is wrapped
into a native shell — no React Native rewrite needed.

## What's already wired

- `capacitor.config.ts` — App ID `com.pullbidlive.app`, splash, status bar, keyboard, push.
- Installed plugins: `@capacitor/app`, `camera`, `push-notifications`, `splash-screen`,
  `status-bar`, `haptics`, `share`, `keyboard`, `preferences`.
- Safe-area insets already applied to the bottom tab bar (`AppShell.tsx`)
  and Live overlays.
- PWA manifest + service worker at `public/manifest.json`, `public/sw.js`.
- Web Push subscribe flow (`src/lib/push.ts`) works in the PWA today;
  swap for `@capacitor/push-notifications` inside the native shell (see below).

## One-time setup (on your local Mac / PC)

You **must** run these locally — Lovable's sandbox cannot build native binaries.

```bash
# 1. Pull the repo from GitHub (use the GitHub button in Lovable)
git clone <your-repo> && cd <your-repo>
bun install

# 2. Build the web bundle Capacitor will wrap
bun run build

# 3. Add the native platforms (creates ios/ and android/ folders)
bunx cap add ios
bunx cap add android

# 4. Copy web build + plugins into native projects
bunx cap sync
```

## Daily dev loop

```bash
bun run build && bunx cap sync
bunx cap open ios       # opens Xcode — Run on simulator or device
bunx cap open android   # opens Android Studio
```

For **live reload** against the hosted Lovable preview (skip native rebuilds):

```bash
CAP_SERVER_URL=https://<your-project>.lovable.app bunx cap sync
bunx cap open ios
```

## Required native config

### iOS — `ios/App/App/Info.plist`

Add usage strings (Apple rejects builds without them):

```xml
<key>NSCameraUsageDescription</key>
<string>PullBid Live uses your camera to scan cards and stream live.</string>
<key>NSMicrophoneUsageDescription</key>
<string>PullBid Live uses your microphone for live audio during streams.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>PullBid Live needs photo access to upload card images.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>PullBid Live saves shared cards to your photo library.</string>
```

For push: enable **Push Notifications** + **Background Modes → Remote
notifications** in Xcode → Signing & Capabilities. Upload an APNs key in
App Store Connect.

**Firebase config (already in repo):** the iOS Firebase config lives at
`ios-config/GoogleService-Info.plist` (project `pullbid-live-c9598`,
bundle `com.pullbidlive.app`). After `bunx cap add ios`, copy it into the
native project and add it to the Xcode target:

```bash
cp ios-config/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
```

Then in Xcode, drag `GoogleService-Info.plist` into the `App` target so it's
bundled (check "Copy items if needed" + the App target membership). FCM uses
this to bridge to APNs — no server secret changes needed (`FCM_SERVICE_ACCOUNT`
already covers the send side).


### Android — `android/app/src/main/AndroidManifest.xml`

Capacitor auto-adds most permissions. Verify these are present:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

For push: add `google-services.json` from Firebase to `android/app/`.

## App Store / Play Store checklist

- [ ] Bump version in `ios/App/App.xcodeproj` and `android/app/build.gradle`.
- [ ] Generate app icons + splash from `public/logo.png`
      (`bunx @capacitor/assets generate --iconBackgroundColor "#0a0a0a"`).
- [ ] Privacy policy URL → use `https://pullbidlive.com/legal/privacy`.
- [ ] App Tracking Transparency: not needed (no third-party tracking SDKs).
- [ ] Test on iPhone SE (smallest), iPhone 15 Pro Max, Pixel 8, foldable.
- [ ] Verify camera + push + Stripe Connect in TestFlight / Internal Testing
      **before** production submission.

## Swapping web push for native push

Inside `src/lib/push.ts`, detect Capacitor and branch:

```ts
import { Capacitor } from "@capacitor/core";

if (Capacitor.isNativePlatform()) {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.requestPermissions();
  await PushNotifications.register();
  // PushNotifications.addListener('registration', token => save to Supabase)
} else {
  // existing web-push subscribe flow
}
```

Wire the native FCM/APNs token into the same `push_subscriptions` table.

## Performance / approval gotchas

- All routes are mobile-first and use safe-area insets — no further layout work needed.
- No hover-only controls; every interactive element has a tap target ≥ 44px.
- Service worker skips registration inside Lovable's iframe preview (intentional).
- Stripe Connect onboarding uses an in-app browser (`@capacitor/browser`
  is **not** required — Stripe handles its own redirect).
- Live streaming uses Cloudflare Calls (WebRTC) — works natively on iOS 14.5+ / Android 7+.
