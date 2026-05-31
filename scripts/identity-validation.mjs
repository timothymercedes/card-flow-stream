#!/usr/bin/env bun
// Phase D — Master card-identity validation harness.
//
// Runs OFFLINE (no DB) against the two fingerprint implementations to catch the
// drift that causes duplicate master identities and wrong language/variant
// matches. Run:  bun scripts/identity-validation.mjs
//
// It mirrors:
//   - edge:   supabase/functions/_shared/cards/identity.ts  computeFingerprint
//   - server: src/lib/masterIdentity.server.ts              computeFingerprint
// and asserts the invariants the live system depends on.

// ---- shared normalizers (identical in both impls) -------------------------
const norm = (s) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function normalizeLangCode(lang) {
  const l = String(lang || "").trim().toLowerCase();
  if (!l) return "en";
  if (/^(en|eng|english)$/.test(l)) return "en";
  if (/^(jp|ja|jpn|japanese)$/.test(l)) return "jp";
  if (/^(zh|cn|chi|chinese|zh-hans|zh-hant)$/.test(l)) return "zh";
  if (/^(ko|kr|kor|korean)$/.test(l)) return "ko";
  if (/^(fr|fra|fre|french)$/.test(l)) return "fr";
  if (/^(de|deu|ger|german)$/.test(l)) return "de";
  if (/^(es|spa|spanish)$/.test(l)) return "es";
  if (/^(it|ita|italian)$/.test(l)) return "it";
  if (/^(pt|por|portuguese)$/.test(l)) return "pt";
  return l.slice(0, 4);
}

async function sha16(parts) {
  const buf = new TextEncoder().encode(parts);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// EDGE impl — includes manufacturer / player / grade / grading_company.
async function fpEdge(i) {
  const segs = [
    i.category,
    norm(i.name),
    norm(i.set_code || i.set_name),
    norm(i.number),
    i.year ?? "",
    norm(i.manufacturer),
    norm(i.variant),
    norm(i.player),
    norm(i.grade) || "raw",
    norm(i.grading_company),
  ];
  const lang = normalizeLangCode(i.language);
  if (lang !== "en") segs.push(`lang_${lang}`);
  return sha16(segs.join("|"));
}

// SERVER impl — currently hardcodes the manufacturer/player/grade slots empty.
async function fpServer(i) {
  const segs = [
    i.category,
    norm(i.name),
    norm(i.set_code || i.set_name),
    norm(i.number),
    i.year ?? "",
    "", // manufacturer
    norm(i.variant),
    "", // player
    "raw", // grade
    "", // grading company
  ];
  const lang = normalizeLangCode(i.language);
  if (lang !== "en") segs.push(`lang_${lang}`);
  return sha16(segs.join("|"));
}

// ---- test runner ----------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

const charizard = { category: "pokemon", name: "Charizard", set_code: "base1", number: "4/102", year: 1999, variant: "Unlimited · Holo", language: "en" };
const charizardJp = { ...charizard, language: "jp" };
const charizardNonHolo = { ...charizard, variant: "Unlimited · Non-Holo" };
const sportsRaw = { category: "sports", name: "Michael Jordan", set_name: "Fleer", number: "57", year: 1986, manufacturer: "Fleer", player: "Michael Jordan", language: "en" };
const sportsPsa10 = { ...sportsRaw, grade: "psa_10", grading_company: "PSA" };

async function run() {
  // 1. Idempotency — same input hashes the same.
  check("idempotent (edge)", (await fpEdge(charizard)) === (await fpEdge({ ...charizard })));
  check("idempotent (server)", (await fpServer(charizard)) === (await fpServer({ ...charizard })));

  // 2. Language is part of identity (en ≠ jp).
  check("language separation", (await fpEdge(charizard)) !== (await fpEdge(charizardJp)));

  // 3. Variant is part of identity (holo ≠ non-holo).
  check("variant separation", (await fpEdge(charizard)) !== (await fpEdge(charizardNonHolo)));

  // 4. Grade is part of identity (raw ≠ PSA 10).
  check("grade separation", (await fpEdge(sportsRaw)) !== (await fpEdge(sportsPsa10)));

  // 5. Runtime fingerprints must be exactly 32 lowercase hex (NOT the bf_ format).
  const fp = await fpEdge(charizard);
  check("32-hex format", /^[0-9a-f]{32}$/.test(fp), fp);

  // 6. CRITICAL — edge vs server parity. They MUST agree or a card scanned live
  // and the same card entered manually create two master identities.
  const tcgPairs = [["Charizard pokemon", charizard], ["Charizard JP", charizardJp]];
  for (const [label, c] of tcgPairs) {
    check(`edge≡server parity (${label})`, (await fpEdge(c)) === (await fpServer(c)));
  }
  // Sports/graded cards are where the impls DIVERGE today (server drops
  // manufacturer/player/grade). This assertion documents the regression.
  check("edge≡server parity (sports raw)", (await fpEdge(sportsRaw)) === (await fpServer(sportsRaw)),
    "server omits manufacturer/player → duplicate identity risk");
  check("edge≡server parity (sports PSA10)", (await fpEdge(sportsPsa10)) === (await fpServer(sportsPsa10)),
    "server omits grade/grading_company → duplicate identity risk");

  console.log(`\nIdentity validation harness: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log("All invariants hold ✓");
}

run();
