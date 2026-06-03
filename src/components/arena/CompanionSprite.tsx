// PullBid Arena — procedural Companion sprite system.
// A card UNLOCKS a digital companion; the companion is the fighter, NOT the card.
// Each sprite is an original creature generated deterministically from a seed
// (companion id / name) + its collecting category, so every card maps to a
// unique, repeatable Arena fighter. No card art is used during combat.
import { useMemo } from "react";
import { seedFrom } from "@/lib/arenaShared";
import type { ArchetypeKey } from "@/lib/arenaCompanion";

export type CompanionAnim = "idle" | "attack" | "hit" | "dodge" | "victory" | "defeat";

// Category palettes — give each collecting community its own creature look.
const PALETTES: Record<string, { body: string; belly: string; accent: string; eye: string }> = {
  pokemon:   { body: "#f5b301", belly: "#fff3c4", accent: "#3b6fd4", eye: "#1a1a1a" },
  onepiece:  { body: "#d23b3b", belly: "#ffd9b3", accent: "#1f2d3d", eye: "#1a1a1a" },
  mtg:       { body: "#6c4bd6", belly: "#e7dcff", accent: "#f2b705", eye: "#1a1a1a" },
  yugioh:    { body: "#8a5a2b", belly: "#f0d9a8", accent: "#b3262d", eye: "#1a1a1a" },
  sports:    { body: "#1f8f4e", belly: "#d8f5e2", accent: "#ef6c00", eye: "#1a1a1a" },
  lorcana:   { body: "#2aa6b8", belly: "#d6f6fb", accent: "#f4c542", eye: "#1a1a1a" },
  marvel:    { body: "#d4242e", belly: "#ffd6d9", accent: "#1c3faa", eye: "#ffffff" },
  starwars:  { body: "#3a3f4b", belly: "#c7ccd6", accent: "#39d0d8", eye: "#39d0d8" },
  wrestling: { body: "#c2410c", belly: "#ffe2cc", accent: "#facc15", eye: "#1a1a1a" },
  other:     { body: "#7c5cff", belly: "#e9e3ff", accent: "#22d3ee", eye: "#1a1a1a" },
};

type Headgear =
  | "ears" | "hat" | "wizard" | "horns" | "band" | "crown" | "mask" | "helmet" | "antenna"
  | "catears" | "wolfears" | "draconic" | "beak" | "halo" | "visor" | "pirate" | "hood" | "skull";

export type HeadgearOverride = Headgear;
export const HEADGEAR_OPTIONS: Headgear[] = [
  "ears", "hat", "wizard", "horns", "band", "crown", "mask", "helmet", "antenna",
  "catears", "wolfears", "draconic", "beak", "halo", "visor", "pirate", "hood", "skull",
];

const HEADGEAR_BY_CATEGORY: Record<string, Headgear> = {
  pokemon: "ears", onepiece: "hat", mtg: "wizard", yugioh: "horns", sports: "band",
  lorcana: "crown", marvel: "mask", starwars: "helmet", wrestling: "mask", other: "antenna",
};

// ---------------------------------------------------------------------------
// Archetype → visual features. This is what makes a card's fighter instantly
// recognizable (cat card → feline rogue, dragon card → winged dragon), using
// ORIGINAL silhouettes rather than copying any copyrighted character.
// ---------------------------------------------------------------------------
type ArchetypeFeatures = {
  head: Headgear;
  tail?: "feline" | "bushy" | "reptile" | "spike";
  wings?: "dragon" | "feather" | "insect";
  whiskers?: boolean;
  fangs?: boolean;
  ghost?: boolean; // floats, no feet (undead/phantom)
};

const ARCHETYPE_FEATURES: Partial<Record<ArchetypeKey, ArchetypeFeatures>> = {
  dragon:     { head: "draconic", tail: "reptile", wings: "dragon", fangs: true },
  feline:     { head: "catears", tail: "feline", whiskers: true, fangs: true },
  canine:     { head: "wolfears", tail: "bushy", fangs: true },
  avian:      { head: "beak", wings: "feather" },
  aquatic:    { head: "antenna", tail: "reptile" },
  reptile:    { head: "horns", tail: "spike", fangs: true },
  insect:     { head: "antenna", wings: "insect" },
  arcane:     { head: "wizard" },
  celestial:  { head: "halo", wings: "feather" },
  undead:     { head: "skull", ghost: true },
  mechanical: { head: "visor" },
  buccaneer:  { head: "pirate" },
  knight:     { head: "helmet" },
  ninja:      { head: "hood" },
  elemental:  { head: "horns" },
  athlete:    { head: "band" },
  hero:       { head: "mask", wings: "feather" },
  jedi:       { head: "hood" },
  grappler:   { head: "mask", fangs: true },
  beast:      { head: "horns", tail: "spike", fangs: true },
};

function featuresFor(archetypeKey: ArchetypeKey | undefined, category: string): ArchetypeFeatures {
  if (archetypeKey && ARCHETYPE_FEATURES[archetypeKey]) return ARCHETYPE_FEATURES[archetypeKey]!;
  return { head: HEADGEAR_BY_CATEGORY[category] ?? "antenna" };
}


function palette(category: string) {
  return PALETTES[category] ?? PALETTES.other;
}

// Build a stable, varied description of the creature from the seed.
function describe(seed: number, category: string) {
  const pick = (shift: number, mod: number) => Math.floor((seed >> shift) % mod);
  return {
    roundness: 28 + pick(2, 14),        // body corner radius
    width: 58 + pick(4, 12),            // body width
    eyeGap: 12 + pick(6, 8),            // distance between eyes
    pupil: 0.4 + (pick(8, 6) / 10),     // pupil scale
    spots: pick(10, 4),                 // number of belly spots
    horns: pick(12, 3),                 // accessory variant
    hueShift: pick(14, 24) - 12,        // small body hue variation
    grin: pick(16, 3),                  // mouth variant
    headgear: HEADGEAR_BY_CATEGORY[category] ?? "antenna",
  };
}

// Lightweight HSL shift so two same-category companions still look distinct.
function shiftColor(hex: string, deg: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let rr = 0, gg = 0, bb = 0;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}

function Headgear({ kind, cx, topY, w, accent, body }: {
  kind: Headgear; cx: number; topY: number; w: number; accent: string; body: string;
}) {
  const l = cx - w / 3, r = cx + w / 3;
  switch (kind) {
    case "ears":
      return (
        <g fill={body}>
          <path d={`M${l} ${topY + 6} L${l - 10} ${topY - 24} L${l + 8} ${topY + 2} Z`} />
          <path d={`M${r} ${topY + 6} L${r + 10} ${topY - 24} L${r - 8} ${topY + 2} Z`} />
          <path d={`M${l - 4} ${topY - 6} l-3 -10 l6 4 Z`} fill={accent} />
        </g>
      );
    case "hat":
      return (
        <g>
          <rect x={cx - w / 2 - 4} y={topY - 8} width={w + 8} height={6} rx={3} fill="#1f2d3d" />
          <path d={`M${cx - w / 2} ${topY - 6} Q${cx} ${topY - 30} ${cx + w / 2} ${topY - 6} Z`} fill="#1f2d3d" />
          <circle cx={cx} cy={topY - 16} r={4} fill={accent} />
        </g>
      );
    case "wizard":
      return (
        <g>
          <path d={`M${cx - w / 3} ${topY} L${cx} ${topY - 36} L${cx + w / 3} ${topY} Z`} fill={accent} />
          <circle cx={cx} cy={topY - 34} r={3} fill="#fff" />
        </g>
      );
    case "horns":
      return (
        <g fill={accent}>
          <path d={`M${l} ${topY + 4} q-10 -18 2 -28 q-2 14 6 22 Z`} />
          <path d={`M${r} ${topY + 4} q10 -18 -2 -28 q2 14 -6 22 Z`} />
        </g>
      );
    case "band":
      return <rect x={cx - w / 2} y={topY + 2} width={w} height={7} rx={3} fill={accent} />;
    case "crown":
      return (
        <path d={`M${cx - w / 3} ${topY + 2} l0 -12 l8 7 l6 -14 l6 14 l8 -7 l0 12 Z`} fill={accent} stroke="#0003" />
      );
    case "mask":
      return (
        <path d={`M${cx - w / 2.4} ${topY + 16} q${w / 2.4} -18 ${w / 1.2} 0 l0 6 q-${w / 2.4} 10 -${w / 1.2} 0 Z`}
          fill={accent} opacity={0.92} />
      );
    case "helmet":
      return (
        <g>
          <path d={`M${cx - w / 2.2} ${topY + 14} q${w / 2.2} -26 ${w / 1.1} 0 Z`} fill={accent} />
          <rect x={cx - 3} y={topY - 12} width={6} height={10} rx={3} fill={body} />
        </g>
      );
    case "catears":
      return (
        <g fill={body} stroke="#0002">
          <path d={`M${l - 2} ${topY + 4} L${l - 8} ${topY - 22} L${l + 10} ${topY - 2} Z`} />
          <path d={`M${r + 2} ${topY + 4} L${r + 8} ${topY - 22} L${r - 10} ${topY - 2} Z`} />
          <path d={`M${l} ${topY - 2} l-3 -12 l8 6 Z`} fill={accent} stroke="none" />
          <path d={`M${r} ${topY - 2} l3 -12 l-8 6 Z`} fill={accent} stroke="none" />
        </g>
      );
    case "wolfears":
      return (
        <g fill={shiftColor(body, -12)}>
          <path d={`M${l - 4} ${topY + 4} L${l - 14} ${topY - 18} L${l + 6} ${topY} Z`} />
          <path d={`M${r + 4} ${topY + 4} L${r + 14} ${topY - 18} L${r - 6} ${topY} Z`} />
        </g>
      );
    case "draconic":
      return (
        <g fill={accent}>
          <path d={`M${l} ${topY + 2} q-14 -16 -2 -30 q4 16 12 24 Z`} />
          <path d={`M${r} ${topY + 2} q14 -16 2 -30 q-4 16 -12 24 Z`} />
          <path d={`M${cx - 6} ${topY - 2} l6 -12 l6 12 Z`} fill={shiftColor(accent, 20)} />
        </g>
      );
    case "beak":
      return (
        <g>
          <path d={`M${cx - 6} ${topY - 4} l6 -14 l6 14 Z`} fill={accent} />
        </g>
      );
    case "halo":
      return (
        <ellipse cx={cx} cy={topY - 16} rx={w / 2.6} ry={5} fill="none" stroke="#facc15" strokeWidth={3} />
      );
    case "visor":
      return (
        <g>
          <rect x={cx - w / 2} y={topY + 12} width={w} height={9} rx={2} fill="#0b1220" />
          <rect x={cx - w / 2 + 3} y={topY + 14} width={w - 6} height={4} rx={2} fill={accent} />
          <rect x={cx - 2} y={topY - 14} width={4} height={12} rx={2} fill={accent} />
        </g>
      );
    case "pirate":
      return (
        <g>
          <path d={`M${cx - w / 2 - 4} ${topY - 2} q${w / 2 + 4} -22 ${w + 8} 0 Z`} fill="#1f2d3d" />
          <rect x={cx - w / 2 - 6} y={topY - 4} width={w + 12} height={5} rx={2} fill="#1f2d3d" />
          <text x={cx} y={topY - 8} fontSize="9" textAnchor="middle" fill="#fff">☠</text>
        </g>
      );
    case "hood":
      return (
        <g>
          <path d={`M${cx - w / 2} ${topY + 18} q${w / 2} -34 ${w} 0 l0 8 q-${w / 2} -16 -${w} 0 Z`} fill={shiftColor(body, -16)} />
        </g>
      );
    case "skull":
      return (
        <g fill={accent}>
          <path d={`M${l} ${topY + 2} q-8 -16 4 -24 q-1 12 6 18 Z`} />
          <path d={`M${r} ${topY + 2} q8 -16 -4 -24 q1 12 -6 18 Z`} />
        </g>
      );
    default: // antenna
      return (
        <g stroke={accent} strokeWidth={3} fill="none">
          <path d={`M${cx} ${topY + 2} q-4 -16 -10 -22`} />
          <circle cx={cx - 10} cy={topY - 20} r={4} fill={accent} stroke="none" />
        </g>
      );
  }
}

export function CompanionSprite({
  seedKey, category, archetypeKey, anim = "idle", size = 120, flip = false, level = 1, flair = 0, className = "",
  bodyColor, accentColor, headgear, evolution = 0,
}: {
  seedKey: string;
  category: string;
  /** Card-derived archetype — drives the fighter's silhouette (ears, wings, tail…). */
  archetypeKey?: ArchetypeKey;
  anim?: CompanionAnim;
  size?: number;
  flip?: boolean;
  level?: number;
  /** Rarity flair 0-4 — rarer companions get a stronger aura + a rarity ring. */
  flair?: number;
  className?: string;
  /** Custom-mode overrides (from the companion's cosmetic builder). */
  bodyColor?: string;
  accentColor?: string;
  headgear?: HeadgearOverride;
  /** Evolution stage 0-3 (Lv1/10/25/50) — upgrades scale, aura and crown. */
  evolution?: number;
}) {
  const seed = useMemo(() => seedFrom(seedKey || category || "companion"), [seedKey, category]);
  const d = useMemo(() => describe(seed, category), [seed, category]);
  const feat = useMemo(() => {
    const base = featuresFor(archetypeKey, category);
    return headgear ? { ...base, head: headgear } : base;
  }, [archetypeKey, category, headgear]);
  const pal = palette(category);
  const body = bodyColor ?? shiftColor(pal.body, d.hueShift);
  const belly = pal.belly;
  const accent = accentColor ?? pal.accent;

  const cx = 60;
  const bodyTop = 42;
  const bodyW = d.width;
  const bodyH = 60;
  const bodyLeft = cx - bodyW / 2;

  // Evolution upgrades the silhouette: bigger, brighter, with a crown at max.
  const evo = Math.max(0, Math.min(3, Math.round(evolution)));
  const evoScale = [1, 1.06, 1.13, 1.2][evo];

  // Higher level + rarer + more-evolved companion → stronger aura ring.
  const aura = Math.min(0.85, 0.12 + level * 0.02 + flair * 0.08 + evo * 0.1);

  return (
    <svg
      viewBox="0 0 120 130"
      width={size}
      height={(size * 130) / 120}
      className={`companion-sprite companion-${anim} ${evo >= 3 ? "companion-legendary" : ""} ${className}`}
      style={{
        transform: `${flip ? "scaleX(-1) " : ""}scale(${evoScale})`,
        transformOrigin: "50% 95%",
        overflow: "visible",
      }}
      role="img"
      aria-label="Arena companion"
    >
      <defs>
        <radialGradient id={`aura-${seed}`} cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor={accent} stopOpacity={aura} />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aura / power ring (scales with level + rarity) */}
      <ellipse className="companion-aura" cx={cx} cy={86} rx={bodyW * 0.7} ry={50} fill={`url(#aura-${seed})`} />
      {/* Rarity ring — only for rarer companions */}
      {flair >= 2 && (
        <ellipse cx={cx} cy={108} rx={bodyW * 0.62} ry={11} fill="none"
          stroke={accent} strokeWidth={flair >= 4 ? 3 : 2} opacity={0.35 + flair * 0.1} />
      )}
      {/* Evolution aura ring — glows brighter as the companion evolves */}
      {evo >= 1 && (
        <ellipse className="companion-evo-ring" cx={cx} cy={106} rx={bodyW * 0.66} ry={13} fill="none"
          stroke={evo >= 3 ? "#fbbf24" : evo >= 2 ? "#e879f9" : "#38bdf8"}
          strokeWidth={evo >= 3 ? 3 : 2} opacity={0.55} />
      )}
      {/* Evolution crown — only at the final (Lv50) stage */}
      {evo >= 3 && (
        <g className="companion-evo-crown">
          <path d={`M${cx - 12} ${bodyTop - 14} l4 -12 l5 7 l3 -11 l3 11 l5 -7 l4 12 Z`} fill="#fbbf24" stroke="#b45309" strokeWidth={0.8} />
          <circle cx={cx - 8} cy={bodyTop - 24} r={1.6} fill="#fff7cd" />
          <circle cx={cx} cy={bodyTop - 27} r={1.8} fill="#fff7cd" />
          <circle cx={cx + 8} cy={bodyTop - 24} r={1.6} fill="#fff7cd" />
        </g>
      )}
      {/* Ground shadow (skipped for floating phantoms) */}
      {!feat.ghost && <ellipse cx={cx} cy={122} rx={bodyW * 0.5} ry={6} fill="#0003" />}

      {/* Wings — rendered behind the body */}
      {feat.wings === "dragon" && (
        <g className="companion-wing" fill={shiftColor(accent, 10)} opacity={0.92} stroke="#0002">
          <path d={`M${bodyLeft + 6} ${bodyTop + 16} q-40 -16 -44 18 q22 -6 26 2 q-14 6 -10 18 q18 -10 30 -16 Z`} />
          <path d={`M${bodyLeft + bodyW - 6} ${bodyTop + 16} q40 -16 44 18 q-22 -6 -26 2 q14 6 10 18 q-18 -10 -30 -16 Z`} />
        </g>
      )}
      {feat.wings === "feather" && (
        <g className="companion-wing" fill="#fff" opacity={0.9} stroke="#0001">
          <path d={`M${bodyLeft + 6} ${bodyTop + 18} q-34 -6 -38 22 q20 -10 24 -4 q-10 8 -6 16 q14 -12 26 -18 Z`} />
          <path d={`M${bodyLeft + bodyW - 6} ${bodyTop + 18} q34 -6 38 22 q-20 -10 -24 -4 q10 8 6 16 q-14 -12 -26 -18 Z`} />
        </g>
      )}
      {feat.wings === "insect" && (
        <g className="companion-wing" fill={accent} opacity={0.4} stroke="#0002">
          <ellipse cx={bodyLeft - 8} cy={bodyTop + 24} rx={18} ry={10} transform={`rotate(-24 ${bodyLeft - 8} ${bodyTop + 24})`} />
          <ellipse cx={bodyLeft + bodyW + 8} cy={bodyTop + 24} rx={18} ry={10} transform={`rotate(24 ${bodyLeft + bodyW + 8} ${bodyTop + 24})`} />
        </g>
      )}

      {/* Tail */}
      {feat.tail === "feline" && (
        <path d={`M${bodyLeft + bodyW - 6} ${bodyTop + bodyH - 4} q26 6 22 -22 q-2 -10 8 -12`} fill="none" stroke={body} strokeWidth={7} strokeLinecap="round" />
      )}
      {feat.tail === "bushy" && (
        <path d={`M${bodyLeft + bodyW - 8} ${bodyTop + bodyH - 6} q28 0 28 -22 q10 6 4 18 q12 0 6 12 q-22 6 -38 -6 Z`} fill={shiftColor(body, -12)} />
      )}
      {feat.tail === "reptile" && (
        <path d={`M${bodyLeft + bodyW - 8} ${bodyTop + bodyH - 8} q34 4 40 26 q-16 -6 -24 -2 q-8 -10 -18 -12 Z`} fill={body} />
      )}
      {feat.tail === "spike" && (
        <path d={`M${bodyLeft + bodyW - 8} ${bodyTop + bodyH - 8} q28 6 34 24 l-8 -2 l4 8 l-10 -6 q-6 -12 -18 -16 Z`} fill={shiftColor(body, -8)} />
      )}

      {/* Feet (phantoms get a wispy floating tail instead) */}
      {feat.ghost ? (
        <path className="companion-feet" d={`M${bodyLeft + 6} ${bodyTop + bodyH - 6} q${bodyW / 2} 30 ${bodyW - 12} 0 q-8 18 -${(bodyW - 12) / 2} 18 q-${(bodyW - 12) / 2} 0 -${bodyW - 12} -18 Z`} fill={body} opacity={0.85} />
      ) : (
        <g className="companion-feet" fill={shiftColor(body, -10)}>
          <ellipse cx={cx - bodyW / 4} cy={114} rx={9} ry={6} />
          <ellipse cx={cx + bodyW / 4} cy={114} rx={9} ry={6} />
        </g>
      )}

      {/* Arms */}
      <g className="companion-arms" fill={body}>
        <path className="companion-arm-l" d={`M${bodyLeft + 4} ${bodyTop + 24} q-16 6 -14 24 q8 -2 16 -10 Z`} />
        <path className="companion-arm-r" d={`M${bodyLeft + bodyW - 4} ${bodyTop + 24} q16 6 14 24 q-8 -2 -16 -10 Z`} />
      </g>

      {/* Body */}
      <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={d.roundness} fill={body} stroke="#0002" />
      {/* Belly */}
      <ellipse cx={cx} cy={bodyTop + bodyH * 0.62} rx={bodyW * 0.3} ry={bodyH * 0.32} fill={belly} />
      {/* Belly spots */}
      {Array.from({ length: d.spots }).map((_, i) => (
        <circle key={i} cx={cx - 10 + i * 8} cy={bodyTop + bodyH * 0.7} r={2.2} fill={accent} opacity={0.5} />
      ))}

      {/* Headgear (archetype-driven) */}
      <Headgear kind={feat.head} cx={cx} topY={bodyTop} w={bodyW} accent={accent} body={body} />

      {/* Whiskers */}
      {feat.whiskers && (
        <g stroke="#0006" strokeWidth={1.4} strokeLinecap="round">
          <path d={`M${cx - 6} ${bodyTop + 28} l-16 -3`} />
          <path d={`M${cx - 6} ${bodyTop + 31} l-16 3`} />
          <path d={`M${cx + 6} ${bodyTop + 28} l16 -3`} />
          <path d={`M${cx + 6} ${bodyTop + 31} l16 3`} />
        </g>
      )}
      {/* Fangs */}
      {feat.fangs && (
        <g fill="#fff" stroke="#0002">
          <path d={`M${cx - 5} ${bodyTop + 33} l3 6 l3 -6 Z`} />
          <path d={`M${cx + 5} ${bodyTop + 33} l-3 6 l3 0 Z`} />
        </g>
      )}


      {/* Eyes */}
      <g>
        <circle cx={cx - d.eyeGap / 2} cy={bodyTop + 20} r={7} fill="#fff" />
        <circle cx={cx + d.eyeGap / 2} cy={bodyTop + 20} r={7} fill="#fff" />
        <circle className="companion-pupil" cx={cx - d.eyeGap / 2} cy={bodyTop + 21} r={3.6 * d.pupil + 1.4} fill={pal.eye} />
        <circle className="companion-pupil" cx={cx + d.eyeGap / 2} cy={bodyTop + 21} r={3.6 * d.pupil + 1.4} fill={pal.eye} />
      </g>

      {/* Mouth */}
      {d.grin === 0 ? (
        <path d={`M${cx - 8} ${bodyTop + 34} q8 8 16 0`} stroke="#0008" strokeWidth={2} fill="none" strokeLinecap="round" />
      ) : d.grin === 1 ? (
        <path d={`M${cx - 9} ${bodyTop + 33} q9 10 18 0 q-9 4 -18 0 Z`} fill="#0007" />
      ) : (
        <ellipse cx={cx} cy={bodyTop + 35} rx={4} ry={3} fill="#0007" />
      )}
    </svg>
  );
}
