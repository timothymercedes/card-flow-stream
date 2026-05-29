# App Store & Play Store Listing — PullBid Live

Ready-to-paste metadata for App Store Connect and Google Play Console.
Keep this in sync with the in-app copy and the marketing site (pullbidlive.com).

## Identity

| Field | Value |
|---|---|
| App name | PullBid Live |
| Bundle / App ID | `com.pullbidlive.app` |
| Category (primary) | Shopping |
| Category (secondary) | Entertainment |
| Default language | English (U.S.) |
| Support URL | https://pullbidlive.com/support |
| Marketing URL | https://pullbidlive.com |
| Privacy Policy URL | https://pullbidlive.com/legal/privacy |
| Terms URL | https://pullbidlive.com/legal/terms |

## Subtitle (App Store, 30 char max)

`Live trading card auctions`

## Promotional text (App Store, 170 char max)

`Bid live on trading cards, follow your favorite sellers, and build your vault — all in one mobile-first marketplace. Sports, TCG, and sealed breaks welcome.`

## Short description (Play, 80 char max)

`Live trading card auctions, breaks, and a marketplace for collectors.`

## Full description (both stores)

```
PullBid Live is the mobile-first home for trading card collectors.

LIVE AUCTIONS
Join real-time auctions and breaks hosted by trusted sellers. Bid with a tap,
watch the action stream live, and never miss a card you want.

MARKETPLACE
Browse sports cards, TCG singles, slabs, and sealed product. Buy now or make
offers — with buyer protection and tracked shipping built in.

YOUR VAULT
Organize everything you win or buy in a personal vault. Track value over time
with built-in pricing intelligence.

FOLLOW & GET NOTIFIED
Follow sellers and get an instant push notification the moment they go live or
list something new.

SELL WITH EASE
Scan cards with your camera, list in seconds, go live, and get paid securely
through Stripe. Shipping labels are handled in-app.

Whether you collect sports, Pokémon, or any TCG, PullBid Live makes every bid
count.
```

## Keywords (App Store, 100 char comma-separated)

`trading cards,sports cards,auction,pokemon,TCG,breaks,collectibles,slabs,marketplace,bidding,vault`

## What's New (release notes — template)

```
- Native push notifications: get alerted the instant a seller goes live.
- Faster, smoother live auction experience.
- Bug fixes and performance improvements.
```

## Age rating

- **Apple:** 17+ — "Simulated Gambling" is NOT applicable (real-money auctions,
  not gambling), but contests/auctions + unrestricted web access push the rating
  up. Confirm answers in App Store Connect: Frequent/Intense — none; Unrestricted
  Web Access — Yes (in-app browser for Stripe). Likely lands at 17+.
- **Google Play:** complete the IARC questionnaire; expected "Teen" with
  "Users interact" + "Shares location: No" + "Digital purchases: Yes".

## Data safety / privacy nutrition labels

Data collected and linked to the user:
- **Contact info:** email (account), name/username.
- **Financial info:** purchase history. Payment card data is handled by Stripe —
  PullBid Live never stores card numbers.
- **User content:** photos (card images), messages (DMs/chat).
- **Identifiers:** user ID, device push token.
- **Location:** none (shipping address is user-entered, not device GPS).

Purposes: app functionality, account management, payments, fraud prevention.
No data sold. No third-party advertising SDKs. No cross-app tracking
→ App Tracking Transparency prompt NOT required.

Encryption in transit: yes. Account deletion: available in-app
(Settings → Account → Delete account) and at
https://pullbidlive.com/support.

## Permissions rationale (for review notes)

| Permission | Why |
|---|---|
| Camera | Scan / photograph cards to list; live video for sellers. |
| Microphone | Live audio during seller streams. |
| Photo Library | Upload existing card images. |
| Notifications | Alert buyers when followed sellers go live or list. |

## Screenshots — ✅ generated

Marketing screenshots (branded background + device frame + caption) are
generated and saved to `/mnt/documents/store-screenshots/`:

- `ios-6.7/` — 1290×2796 px (iPhone 6.7" / 15 Pro Max). App Store requires at
  least one 6.7" screenshot to submit. ✅
- `android-phone/` — 1080×2400 px (Play phone screenshots). ✅
- Frames: `home.png` (Pull. Bid. Vault.), `live.png` (Watch & win live
  auctions), `market.png` (Buy & sell the cards you love).

Regenerate any time with `/tmp/frame_shots.py` (reads phone-width captures from
`/tmp/shots`). For richer marketing shots later, capture device/simulator
screens with populated live + marketplace data (iPad 12.9" only if iPad is a
supported destination; otherwise mark the app iPhone-only).

## Account deletion — ✅ App Store 5.1.1(v) compliant

Users can permanently delete their account **in-app**:
**Settings → Account → Delete account** (type `DELETE` to confirm). This calls
the `deleteMyAccount` server function, which purges user-scoped data and removes
the auth account. Provide this same path in the App Store review notes and add
`https://pullbidlive.com/support` as the Google Play **Account deletion URL**
(Play Console → App content → Data safety → Account deletion).

## Review notes (paste into App Store Connect "Notes")

```
Demo account: provide a test login with buyer + seller roles.
Live streaming uses Cloudflare Calls (WebRTC). Payments use Stripe Connect in a
secure in-app browser. Push notifications deliver live-show and order alerts.
No gambling — auctions are real-purchase commerce with buyer protection.
Account deletion: Settings → Account → Delete account (in-app, immediate).
```

## Submission checklist — TestFlight & Play Internal Testing

Build (Mac, after `bunx cap add ios/android` — see CAPACITOR.md):

1. `bun run build && bunx cap sync`
2. Drop in `GoogleService-Info.plist` (iOS) / `google-services.json` (Android).
3. Add Info.plist usage strings + Push + Background Modes capabilities in Xcode.
4. `bunx @capacitor/assets generate` for native icons/splash.

TestFlight (iOS):
1. Archive in Xcode → upload to App Store Connect.
2. Complete Export Compliance (encryption in transit only → standard exemption).
3. Add internal testers → distribute build → install via TestFlight app.

Play Internal Testing (Android):
1. `./gradlew bundleRelease` → upload the `.aab` to Play Console.
2. Create an **Internal testing** track, add tester emails, share the opt-in link.
3. Complete Data safety + Account deletion URL before promoting to production.
