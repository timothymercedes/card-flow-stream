# PullBid Live — Codemagic Deployment Guide (No Mac Required)

Everything below is done from a **Windows PC + a web browser**. No Mac, no Xcode,
no Android Studio. The `codemagic.yaml` at the repo root drives both builds.

Bundle / Package ID everywhere: **`com.pullbidlive.app`** ✅ (verified in
`capacitor.config.ts`, `ios-config/GoogleService-Info.plist`,
`android-config/google-services.json`, `STORE_LISTING.md`).

---

## 1. Generate the Android keystore (Windows commands)

You need **Java** (JDK includes `keytool`). If you don't have it:
`winget install Microsoft.OpenJDK.17`  then open a **new** PowerShell window.

```powershell
# Run in PowerShell. Keep the file and passwords FOREVER — losing them means
# you can never update the app on Google Play again.
keytool -genkey -v `
  -keystore pullbidlive-upload.jks `
  -alias pullbidlive `
  -keyalg RSA -keysize 2048 -validity 10000
```

Answer the prompts (name, org, city, country). Pick a strong **store password**
and **key password** (you can use the same for both). Remember:

| Field | Value you chose |
|-------|-----------------|
| Keystore file | `pullbidlive-upload.jks` |
| Key alias | `pullbidlive` |
| Store password | (the one you typed) |
| Key password | (the one you typed) |

Now Base64-encode the keystore so it can be pasted into Codemagic:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pullbidlive-upload.jks")) | Set-Clipboard
# The Base64 string is now on your clipboard — paste it into the CM_KEYSTORE secret.
```

---

## 2. Create the App Store Connect API key (iOS signing — no Mac)

1. Go to **https://appstoreconnect.apple.com** → **Users and Access** → **Integrations** tab → **App Store Connect API**.
2. Click **+** to generate a key. Name: `Codemagic`. Access: **App Manager**.
3. Click **Generate**. Download the **`.p8` file** (you can only download it ONCE).
4. Note these three values (you'll paste all into Codemagic):
   - **Issuer ID** (top of the page, a UUID)
   - **Key ID** (next to the key you created)
   - The **`.p8`** file contents
5. Also grab your app's **numeric Apple ID**: App Store Connect → your app →
   **App Information** → "Apple ID" (a 10-digit number). Put it in
   `codemagic.yaml` → `APP_STORE_APPLE_ID`.

> This API key lets Codemagic create the distribution certificate AND the
> provisioning profile automatically — that's why no Mac/Keychain is needed.

---

## 3. Create the APNs Auth Key (.p8) — required for iOS push

1. Go to **https://developer.apple.com/account** → **Certificates, IDs & Profiles** → **Keys**.
2. Click **+**, name it `PullBid Live APNs`, tick **Apple Push Notifications service (APNs)**, **Continue → Register**.
3. **Download** the `.p8` file (one-time download). Note the **Key ID** and your **Team ID**.
4. Go to **Firebase Console → Project `pullbid-live-c9598` → Project Settings → Cloud Messaging → Apple app configuration**.
5. Under **APNs Authentication Key**, click **Upload**, choose the `.p8`, enter the **Key ID** and **Team ID**, **Upload**.

> Without this, iOS push silently fails and Apple may reject the build. FCM
> bridges to APNs using this key — your app already captures the token.

Also enable the **Push Notifications** capability on the App ID:
Developer portal → **Identifiers** → `com.pullbidlive.app` → tick **Push Notifications** → **Save**. (The `codemagic.yaml` also writes the `aps-environment` entitlement at build time.)

---

## 4. Connect GitHub, Firebase, Apple & Google Play to Codemagic

### 4a. GitHub
1. Create a free account at **https://codemagic.io** → sign in with GitHub.
2. **Add application** → authorize Codemagic → pick your PullBid Live repo.
3. Choose **"codemagic.yaml"** as the configuration source (it's already in your repo).

### 4b. Apple (App Store Connect integration)
1. Codemagic → **Teams → (your team) → Integrations → Developer Portal → App Store Connect → Connect**.
2. Enter **Issuer ID**, **Key ID**, and upload the **`.p8`** from Step 2.
3. Then add an **environment variable group** named **`app_store_credentials`** (Codemagic → your app → Environment variables) — for the modern `auth: integration` flow you mainly need the group to exist; the integration above supplies signing. If using key-based vars instead, add: `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_IDENTIFIER`, `APP_STORE_CONNECT_PRIVATE_KEY` (paste full `.p8` text), and `CERTIFICATE_PRIVATE_KEY` (leave blank to auto-generate).

### 4c. Google Play (service account)
1. **https://console.cloud.google.com** → select the project linked to your Play Console → **IAM & Admin → Service Accounts → Create service account** (`codemagic-publisher`).
2. **Create key → JSON** → download it.
3. **Google Play Console → Users and permissions → Invite new users** → paste the service account email → grant **Release to testing tracks** (Admin is simplest for setup). Accept.
4. In Codemagic, create env var group **`google_play_credentials`** with variable **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`** = the full JSON file contents. Mark it **Secure**.

### 4d. Keystore group
Create env var group **`keystore_credentials`** with (all marked **Secure**):
| Variable | Value |
|----------|-------|
| `CM_KEYSTORE` | the Base64 string from Step 1 |
| `CM_KEYSTORE_PASSWORD` | your store password |
| `CM_KEY_ALIAS` | `pullbidlive` |
| `CM_KEY_PASSWORD` | your key password |

### 4e. Firebase
No Codemagic integration needed — the config files
(`ios-config/GoogleService-Info.plist`, `android-config/google-services.json`)
are committed and copied into the native projects during the build.

---

## 5. Automatic delivery

Already wired in `codemagic.yaml`:

- **iOS** → `publishing.app_store_connect.submit_to_testflight: true` → every
  successful build lands in **TestFlight → Internal Testers** group. (Create that
  group once in App Store Connect → TestFlight, or rename in the yaml.)
- **Android** → `publishing.google_play.track: internal` → every successful
  build uploads to **Play Console → Internal testing**.

Trigger a build: Codemagic → your app → **Start new build** → pick the workflow
(`ios-testflight` or `android-internal`) → **Start**. (You can later add
`triggering:` on push to `main` for full automation.)

---

## 6. Push notification configuration — verification

| Item | Status |
|------|--------|
| Capacitor push plugin installed (`@capacitor/push-notifications`) | ✅ |
| Native token capture + deep-link on tap (`src/lib/capacitor.ts`, `src/lib/push.ts`) | ✅ |
| Tokens stored as `ios://` / `android://` in `push_subscriptions` | ✅ |
| FCM delivery server (`src/server/fcm.server.ts`) | ✅ |
| `FCM_SERVICE_ACCOUNT` server secret | ✅ (used for sends) |
| Firebase iOS app `com.pullbidlive.app` config | ✅ committed |
| Firebase Android app `com.pullbidlive.app` config | ✅ committed |
| iOS `aps-environment` entitlement | ✅ added by `codemagic.yaml` |
| iOS `remote-notification` background mode | ✅ added by `codemagic.yaml` |
| **APNs `.p8` uploaded to Firebase** | ❗ YOU must do this (Step 3) |
| **Push capability on App ID** | ❗ YOU must do this (Step 3) |

**Only remaining push gap:** the APNs key upload + App ID capability (Step 3).
Everything in code is done.

---

## 7. Permissions verification

| Permission | iOS | Android |
|-----------|-----|---------|
| Camera | `NSCameraUsageDescription` (injected by CI) | auto by Capacitor camera plugin |
| Microphone | `NSMicrophoneUsageDescription` (injected) | `RECORD_AUDIO` |
| Photo Library | `NSPhotoLibraryUsageDescription` + `Add` (injected) | media perms by plugin |
| Notifications | push entitlement (injected) | `POST_NOTIFICATIONS` |

---

## 8. FINAL LAUNCH CHECKLIST — do these in this exact order

**Phase A — Credentials (browser + Windows, ~45 min)**
1. [ ] Install Java, run the `keytool` command (Step 1), Base64-copy the keystore.
2. [ ] Create App Store Connect API key, download `.p8`, note Issuer ID + Key ID (Step 2).
3. [ ] Grab your app's numeric Apple ID → put in `codemagic.yaml` `APP_STORE_APPLE_ID`.
4. [ ] Create APNs `.p8` key, upload to Firebase, enable Push on the App ID (Step 3).
5. [ ] Create Google Cloud service account JSON, invite it in Play Console (Step 4c).

**Phase B — Codemagic wiring (~20 min)**
6. [ ] Sign in to Codemagic with GitHub, add the repo, select `codemagic.yaml`.
7. [ ] Connect Apple App Store Connect integration (Step 4b).
8. [ ] Create env groups: `app_store_credentials`, `google_play_credentials`, `keystore_credentials` (Steps 4b–4d).

**Phase C — First builds**
9. [ ] Start the **`android-internal`** workflow → confirm `.aab` reaches Play Console → Internal testing.
10. [ ] Start the **`ios-testflight`** workflow → confirm build reaches TestFlight (Processing ~5–15 min).

**Phase D — Store metadata (browser)**
11. [ ] Upload screenshots (iPhone 6.7"/6.5", iPad 12.9" if supported; Android phone + tablet).
12. [ ] Fill App Privacy labels (App Store) + Data Safety form (Play).
13. [ ] Answer age-rating questionnaires (both stores).
14. [ ] Set URLs: Privacy `https://pullbidlive.com/legal/privacy`, Terms `https://pullbidlive.com/legal/tos`, Deletion `https://pullbidlive.com/legal/account-deletion`.
15. [ ] Enter reviewer login (`reviewer.buyer@pullbidlive.com` / `PullBidReview!2026`) + seller note in both consoles.

**Phase E — Test & submit**
16. [ ] TestFlight: add yourself as tester, install on a real iPhone, verify login + push + auction.
17. [ ] Play Internal testing: open opt-in link, install on Android, verify same.
18. [ ] Submit for App Store review.
19. [ ] Promote Play track to **Production** review.
20. [ ] On approval → release publicly. 🚀
</content>
