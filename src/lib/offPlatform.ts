// Off-platform payment detector (pure, shared). Server triggers mirror these rules.
export type Risk = "none" | "low" | "medium" | "high";
export interface Detection { risk: Risk; score: number; reasons: string[]; terms: string[] }

export const DEFAULT_TERMS: Record<string, string[]> = {
  "Cash App": ["cashapp", "cashap", "kashapp", "cashaap", "squarecash"],
  Zelle: ["zelle", "zele", "zell"],
  Venmo: ["venmo", "venmoe", "vemno", "venm0"],
  PayPal: ["paypal", "paypa1", "paypai", "ppal", "pp f&f", "friendsandfamily"],
  "Apple Cash": ["applecash", "applepay"],
  "Google Pay": ["googlepay", "gpay"],
  "Facebook Pay": ["facebookpay", "metapay"],
  "Wire transfer": ["wiretransfer", "wire"],
  "Direct deposit": ["directdeposit"],
  Crypto: ["bitcoin", "usdt", "crypto"],
};

const LEET: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

/** Lowercase, undo leetspeak, drop spacing/punctuation so "c a $ h-a p p" -> "cashapp". */
export function squash(text: string): string {
  return text.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] ?? c).replace(/[^a-z]/g, "");
}

const NEGATION = /\b(don'?t|do not|never|no|not|won'?t|avoid|refuse|only (through|via|on) pullbid)\b[^.!?]{0,40}$/i;
const INTENT = /\b(send|pay|paying|payment|text|dm|hit me|message me|contact me|call me|venmo me|zelle me|cash ?app me|outside|off (the )?(app|platform|site)|direct(ly)?|skip (the )?(checkout|fees)|avoid (the )?fees|cheaper|for this|deal|cash (only|on pickup)|in cash)\b/i;
const CASHTAG = /(^|\s)\$[a-z][a-z0-9_]{2,19}\b/i;
const PHONE = /(\+?\d[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EXT_LINK = /\b(paypal\.me|cash\.app|venmo\.com|wa\.me|t\.me|bit\.ly)\/?\S*/i;
const BYPASS = /\b(skip|avoid|bypass|outside( of)?|off) (the )?(checkout|fees?|platform|app|pullbid)\b/i;

export function detectOffPlatform(text: string, terms: Record<string, string[]> = DEFAULT_TERMS): Detection {
  const reasons: string[] = []; const hits: string[] = [];
  if (!text?.trim()) return { risk: "none", score: 0, reasons, terms: hits };
  const sq = squash(text);
  const words = text.toLowerCase();
  for (const [label, variants] of Object.entries(terms)) {
    for (const v of variants) {
      const key = squash(v);
      if (key.length < 3) continue;
      // short generic words must appear as a whole word, not inside others
      const found = key.length <= 4 || key === "wire" ? new RegExp(`\\b${key}\\b`).test(words.replace(/[^a-z\s]/g, "")) : sq.includes(key);
      if (found) { hits.push(label); break; }
    }
  }
  let score = 0;
  if (hits.length) { score += 30; reasons.push(`Mentions ${hits.join(", ")}`); }
  if (CASHTAG.test(text)) { score += 40; reasons.push("Payment handle ($cashtag)"); hits.push("$cashtag"); }
  if (EXT_LINK.test(text)) { score += 50; reasons.push("External payment or contact link"); }
  if (PHONE.test(text)) { score += 25; reasons.push("Phone number"); }
  if (BYPASS.test(text)) { score += 45; reasons.push("Asks to bypass checkout"); }
  const intent = INTENT.test(text);
  if (intent && (hits.length || PHONE.test(text))) { score += 35; reasons.push("Payment or contact request"); }
  if (/\$\s?\d+|\d+\s?(dollars|bucks)/i.test(text) && hits.length) { score += 15; reasons.push("Names a price"); }
  // Educational/negated mentions ("I don't accept Cash App") stay low.
  if (hits.length && !CASHTAG.test(text) && !EXT_LINK.test(text)) {
    const firstIdx = Math.min(...hits.map((h) => words.search(new RegExp(h.split(" ")[0].toLowerCase()))).filter((i) => i >= 0), words.length);
    if (NEGATION.test(words.slice(0, firstIdx + 1))) { score = Math.min(score, 20); reasons.push("Negated / safety mention"); }
  }
  const risk: Risk = score >= 70 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "none";
  return { risk, score, reasons, terms: [...new Set(hits)] };
}
