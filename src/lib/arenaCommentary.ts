// PullBid Arena — battle commentary engine (client-safe, deterministic).
// Turns each resolved round into a punchy play-by-play line so battles feel
// narrated like a real sport, not a stat readout. Fully deterministic: the same
// battle always produces the same commentary, so replays match exactly.

export type CommentaryInput = {
  round: number;
  attacker: string;        // attacker companion name
  defender: string;        // defender companion name
  kind: "crit" | "dodge" | "hit" | "block";
  skill: "basic" | "special" | "recover";
  dmg: number;
  healAmt: number;
  elementVerb: string;     // e.g. "scorched", "slashed"
  signature?: string;      // archetype signature move name (for specials)
  seed: number;            // per-event seed for deterministic variety
  isFinal: boolean;        // last round of the battle
  attackerWonBattle: boolean;
};

export type CommentaryLine = {
  round: number;
  text: string;
  tone: "crit" | "dodge" | "hit" | "block" | "heal" | "finish";
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function first(name: string): string {
  return name.split(" ")[0] || name;
}

// Build a single commentary line from a resolved round.
export function commentaryFor(i: CommentaryInput): CommentaryLine {
  const A = first(i.attacker);
  const D = first(i.defender);

  if (i.healAmt > 0) {
    return {
      round: i.round,
      tone: "heal",
      text: pick(
        [
          `${A} digs deep and recovers ${i.healAmt} HP — back in the fight!`,
          `A clutch second wind! ${A} heals up ${i.healAmt} and steadies.`,
          `${A} refuses to fold, mending ${i.healAmt} HP mid-battle.`,
        ],
        i.seed,
      ),
    };
  }

  if (i.kind === "dodge") {
    return {
      round: i.round,
      tone: "dodge",
      text: pick(
        [
          `${D} reads it perfectly and slips clean out of danger!`,
          `Whiff! ${A} lunges but ${D} dances away untouched.`,
          `Incredible footwork — ${D} ghosts the attack entirely!`,
        ],
        i.seed,
      ),
    };
  }

  if (i.kind === "block") {
    return {
      round: i.round,
      tone: "block",
      text: pick(
        [
          `${D} throws up a guard and absorbs most of it — only ${i.dmg} through.`,
          `Blocked! ${D} braces hard, shrugging off ${A}'s blow.`,
          `${D} walls it up, but ${i.dmg} chip damage still lands.`,
        ],
        i.seed,
      ),
    };
  }

  if (i.kind === "crit") {
    const moveTxt = i.skill === "special" && i.signature ? ` ${i.signature}` : "";
    if (i.isFinal && i.attackerWonBattle) {
      return {
        round: i.round,
        tone: "finish",
        text: pick(
          [
            `FINISHER!${moveTxt} — ${A} ${i.elementVerb} ${D} for a massive ${i.dmg} to seal it!`,
            `It's over! ${A} unloads${moveTxt} and ${i.elementVerb} ${D} for ${i.dmg}!`,
            `What a finish! ${A}'s${moveTxt || " ultimate"} drops ${D} — ${i.dmg} damage!`,
          ],
          i.seed,
        ),
      };
    }
    return {
      round: i.round,
      tone: "crit",
      text: pick(
        [
          `CRITICAL HIT! ${A}${moveTxt ? ` unleashes${moveTxt} and` : ""} ${i.elementVerb} ${D} for a brutal ${i.dmg}!`,
          `Devastating! ${A} ${i.elementVerb} ${D} clean for ${i.dmg} — the crowd erupts!`,
          `${A} finds the opening${moveTxt ? ` with${moveTxt}` : ""} and ${i.elementVerb} ${D} for ${i.dmg}!`,
        ],
        i.seed,
      ),
    };
  }

  // basic hit
  return {
    round: i.round,
    tone: "hit",
    text: pick(
      [
        `${A} ${i.elementVerb} ${D} for ${i.dmg} and keeps the pressure on.`,
        `Solid connection — ${A} lands for ${i.dmg}.`,
        `${A} trades blows and tags ${D} for ${i.dmg}.`,
        `${A} stays aggressive, ${i.elementVerb} ${D} for ${i.dmg}.`,
      ],
      i.seed,
    ),
  };
}
