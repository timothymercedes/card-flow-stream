#!/usr/bin/env node
/**
 * Build-time auth env validation for PullBid Live.
 *
 * Run by Codemagic BEFORE `bun run build`. It guarantees a build never ships
 * silently falling back to browser OAuth: if a value required for the native
 * authentication sheet is missing, the build FAILS LOUDLY.
 *
 * Usage:  node scripts/verify-auth-env.mjs <ios|android>
 *
 * Why per-platform:
 *  - iOS native Google sheet needs BOTH the Web + iOS client IDs, the Apple
 *    Services ID (native Apple sheet), and the reversed iOS client ID (URL
 *    scheme injected into Info.plist).
 *  - Android native Google sheet only needs the Web client ID (the rest comes
 *    from google-services.json). Apple Sign-In / reversed iOS scheme are not
 *    used on Android, so they are reported but not required there.
 */

const platform = (process.argv[2] || "").toLowerCase();
if (!["ios", "android"].includes(platform)) {
  console.error("✖ verify-auth-env: missing/invalid platform arg. Use 'ios' or 'android'.");
  process.exit(1);
}

const VARS = {
  VITE_GOOGLE_WEB_CLIENT_ID: process.env.VITE_GOOGLE_WEB_CLIENT_ID,
  VITE_GOOGLE_IOS_CLIENT_ID: process.env.VITE_GOOGLE_IOS_CLIENT_ID,
  VITE_APPLE_SERVICES_ID: process.env.VITE_APPLE_SERVICES_ID,
  GOOGLE_IOS_REVERSED_CLIENT_ID: process.env.GOOGLE_IOS_REVERSED_CLIENT_ID,
};

// Which vars are REQUIRED (fail build) vs informational per platform.
const REQUIRED = {
  ios: [
    "VITE_GOOGLE_WEB_CLIENT_ID",
    "VITE_GOOGLE_IOS_CLIENT_ID",
    "VITE_APPLE_SERVICES_ID",
    "GOOGLE_IOS_REVERSED_CLIENT_ID",
  ],
  android: ["VITE_GOOGLE_WEB_CLIENT_ID"],
};

const present = (v) => typeof v === "string" && v.trim().length > 0;
const mask = (v) => {
  if (!present(v)) return "<missing>";
  const s = v.trim();
  if (s.length <= 12) return `${s.slice(0, 3)}…(${s.length} chars)`;
  return `${s.slice(0, 6)}…${s.slice(-6)} (${s.length} chars)`;
};

// Light format sanity-checks (warn only — do not fail the build on these).
const formatWarnings = [];
if (present(VARS.VITE_GOOGLE_WEB_CLIENT_ID) && !VARS.VITE_GOOGLE_WEB_CLIENT_ID.includes(".apps.googleusercontent.com")) {
  formatWarnings.push("VITE_GOOGLE_WEB_CLIENT_ID does not end in .apps.googleusercontent.com — is this the WEB client?");
}
if (present(VARS.VITE_GOOGLE_IOS_CLIENT_ID) && !VARS.VITE_GOOGLE_IOS_CLIENT_ID.includes(".apps.googleusercontent.com")) {
  formatWarnings.push("VITE_GOOGLE_IOS_CLIENT_ID does not end in .apps.googleusercontent.com — is this the iOS client?");
}
if (present(VARS.GOOGLE_IOS_REVERSED_CLIENT_ID) && !VARS.GOOGLE_IOS_REVERSED_CLIENT_ID.startsWith("com.googleusercontent.apps.")) {
  formatWarnings.push("GOOGLE_IOS_REVERSED_CLIENT_ID should start with com.googleusercontent.apps.");
}

console.log("──────────────────────────────────────────────────────");
console.log(`🔐 Auth env validation — platform: ${platform.toUpperCase()}`);
console.log("──────────────────────────────────────────────────────");
for (const [name, value] of Object.entries(VARS)) {
  const req = REQUIRED[platform].includes(name);
  const status = present(value) ? "✓ set" : req ? "✖ MISSING" : "– not set (optional on this platform)";
  console.log(`  ${name.padEnd(32)} ${status.padEnd(38)} ${mask(value)}`);
}

if (formatWarnings.length) {
  console.log("");
  for (const w of formatWarnings) console.log(`  ⚠ ${w}`);
}

const missing = REQUIRED[platform].filter((n) => !present(VARS[n]));

// Compute and print the resulting auth paths so the build log is unambiguous.
const googleNative =
  platform === "ios"
    ? present(VARS.VITE_GOOGLE_WEB_CLIENT_ID) && present(VARS.VITE_GOOGLE_IOS_CLIENT_ID)
    : present(VARS.VITE_GOOGLE_WEB_CLIENT_ID);
const appleNative = platform === "ios" ? true : present(VARS.VITE_APPLE_SERVICES_ID);

console.log("");
console.log("  Resulting authentication paths for this build:");
console.log(`    Native Google Sign-In : ${googleNative ? "ENABLED  ✅" : "DISABLED ❌ (will fall back to browser OAuth)"}`);
console.log(`    Native Apple Sign-In  : ${appleNative ? "ENABLED  ✅" : "DISABLED ❌ (will fall back to browser OAuth)"}`);
console.log(`    Browser OAuth fallback: ${googleNative && appleNative ? "STANDBY (used only on native cancel/error)" : "ACTIVE (some providers lack native config)"}`);
console.log("");

if (missing.length) {
  console.error("✖ BUILD HALTED: required auth variables are missing/empty:");
  for (const n of missing) console.error(`    - ${n}`);
  console.error("");
  console.error("  Set them in Codemagic → App settings → Environment variables");
  console.error("  (attach the group to this workflow & enable for the build), then re-run.");
  process.exit(1);
}

console.log("✓ All required auth variables present. Native authentication sheet WILL be used.");
console.log("──────────────────────────────────────────────────────");
