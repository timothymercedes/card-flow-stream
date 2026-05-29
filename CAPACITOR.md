# PullBid Live — Native iOS & Android (Capacitor)

This project ships as a mobile-first PWA **and** as native iOS / Android apps
via [Capacitor](https://capacitorjs.com).

> **Important — this is a server-rendered (SSR) app.** The TanStack Start build
> produces a server worker, **not** a static `index.html`, so there is nothing to
> bundle offline. The native apps are therefore thin shells that load the hosted
> web app over the network via `server.url` in `capacitor.config.ts` (defaults to
> `https://pullbidlive.com`). `capacitor-shell/index.html` is a tiny placeholder
> shown only while the WebView connects — it exists to satisfy Capacitor's
> required `webDir`/`index.html`. Override the target with `CAP_SERVER_URL`.


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
# 2. Build (validates the project; native shell loads the hosted site)
bun run build


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

**Firebase config (Android):** in the same Firebase project
(`pullbid-live-c9598`), add an **Android app** with package
`com.pullbidlive.app`, download its `google-services.json`, and place it in the
repo at `android-config/google-services.json` (mirrors the iOS file). After
`bunx cap add android`, copy it into the native project:

```bash
cp android-config/google-services.json android/app/google-services.json
```

FCM delivery for Android uses the same `FCM_SERVICE_ACCOUNT` server secret as
iOS — no additional secret is needed.

## App Store / Play Store checklist

- [ ] Bump version in `ios/App/App.xcodeproj` and `android/app/build.gradle`.
- [x] App icon + splash source assets are committed under `assets/`
      (`icon.png` 1024², `splash.png`/`splash-dark.png` 2732², plus adaptive
      `icon-foreground.png` / `icon-background.png`). Generate the native
      icon sets with:
      `bunx @capacitor/assets generate --assetPath assets --iconBackgroundColor "#0a0a0a" --splashBackgroundColor "#0a0a0a"`
- [x] PWA icons (`/icon-192.png`, `/icon-512.png`, maskable, apple-touch-icon)
      are generated and wired into `public/manifest.json`.
- [ ] Privacy policy URL → use `https://pullbidlive.com/legal/privacy`.
## Native push — ✅ DONE (already wired)

`src/lib/push.ts` already branches on `isNative()`:

- **Native (iOS/Android):** requests permission via
  `@capacitor/push-notifications`, registers for APNs/FCM, and stores the token
  in `push_subscriptions` as `ios://<token>` / `android://<token>`.
- **Web/PWA:** the existing VAPID + Service Worker flow.
- **Disable:** `disablePush()` removes the native row (and clears delivered
  notifications) on the shell, or unsubscribes the SW on web.
- **Tap-through:** `initCapacitor()` listens for
  `pushNotificationActionPerformed` and deep-links to the notification's
  `link`/`url`.

Delivery (FCM HTTP v1) and per-device diagnostics (error reason, last attempt,
retry status) live in `src/server/fcm.server.ts` + `src/server/push.server.ts`
and surface in the admin screen at `/admin/push-subscriptions`.

No code changes needed for push — just complete the Xcode/Firebase setup above.
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
