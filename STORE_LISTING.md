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

## Screenshots needed (capture on device/simulator)

- iPhone 6.7" (15 Pro Max) and 6.5" — 3–5 shots: live auction, marketplace,
  card detail, vault, seller go-live.
- iPad 12.9" if iPad is supported (otherwise mark iPhone-only).
- Android phone + 7"/10" tablet for Play.

## Review notes (paste into App Store Connect "Notes")

```
Demo account: provide a test login with buyer + seller roles.
Live streaming uses Cloudflare Calls (WebRTC). Payments use Stripe Connect in a
secure in-app browser. Push notifications deliver live-show and order alerts.
No gambling — auctions are real-purchase commerce with buyer protection.
```
