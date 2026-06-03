// PullBid Arena — Companion generation engine (client-safe, no secrets).
// A collected CARD unlocks a digital ARENA COMPANION. The companion's identity
// (archetype, rarity tier, signature abilities) is derived deterministically
// from the card's own characteristics — name keywords, collecting category and
// rarity — so the same card always maps to the same unique fighter, and a
// richer collection unlocks a richer Arena roster. Cards stay collectibles;
// companions do the fighting.
import { seedFrom } from "@/lib/arenaShared";
import { arenaCategoryFor, type ArenaCategory } from "@/lib/arenaCategories";

// ---------------------------------------------------------------------------
// Archetypes — the "creature/character type" a card unlocks.
// ---------------------------------------------------------------------------
export type ArchetypeKey =
  | "dragon" | "feline" | "canine" | "avian" | "aquatic" | "reptile" | "insect"
  | "arcane" | "celestial" | "undead" | "mechanical" | "buccaneer" | "knight"
  | "ninja" | "elemental" | "athlete" | "hero" | "jedi" | "grappler" | "beast";

export type Archetype = {
  key: ArchetypeKey;
  label: string;   // "Dragon Companion"
  noun: string;    // "Dragon"
  emoji: string;
  /** Signature special move flavor for this archetype. */
  signature: string;
};

const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  dragon:     { key: "dragon",     noun: "Dragon",     label: "Dragon Companion",     emoji: "🐉", signature: "Inferno Breath" },
  feline:     { key: "feline",     noun: "Feline",     label: "Feline Companion",     emoji: "🐱", signature: "Nine Lives Pounce" },
  canine:     { key: "canine",     noun: "Wild",       label: "Wild Companion",       emoji: "🐺", signature: "Pack Howl" },
  avian:      { key: "avian",      noun: "Sky",        label: "Sky Companion",        emoji: "🦅", signature: "Sky Dive" },
  aquatic:    { key: "aquatic",    noun: "Tidal",      label: "Tidal Companion",      emoji: "🌊", signature: "Tidal Crush" },
  reptile:    { key: "reptile",    noun: "Saurian",    label: "Saurian Companion",    emoji: "🦎", signature: "Venom Strike" },
  insect:     { key: "insect",     noun: "Swarm",      label: "Swarm Companion",      emoji: "🐛", signature: "Swarm Assault" },
  arcane:     { key: "arcane",     noun: "Arcane",     label: "Arcane Companion",     emoji: "🔮", signature: "Arcane Nova" },
  celestial:  { key: "celestial",  noun: "Celestial",  label: "Celestial Companion",  emoji: "😇", signature: "Divine Judgment" },
  undead:     { key: "undead",     noun: "Phantom",    label: "Phantom Companion",    emoji: "💀", signature: "Soul Drain" },
  mechanical: { key: "mechanical", noun: "Mechanical", label: "Mechanical Companion", emoji: "🤖", signature: "Overclock Cannon" },
  buccaneer:  { key: "buccaneer",  noun: "Buccaneer",  label: "Buccaneer Companion",  emoji: "🏴‍☠️", signature: "Cannon Barrage" },
  knight:     { key: "knight",     noun: "Knight",     label: "Knight Companion",     emoji: "🛡️", signature: "Valiant Charge" },
  ninja:      { key: "ninja",      noun: "Shadow",     label: "Shadow Companion",     emoji: "🥷", signature: "Shadow Flurry" },
  elemental:  { key: "elemental",  noun: "Elemental",  label: "Elemental Companion",  emoji: "⚡", signature: "Elemental Surge" },
  athlete:    { key: "athlete",    noun: "Athlete",    label: "Athlete Companion",    emoji: "🏅", signature: "Clutch Play" },
  hero:       { key: "hero",       noun: "Hero",       label: "Hero Companion",       emoji: "🦸", signature: "Heroic Finisher" },
  jedi:       { key: "jedi",       noun: "Force",      label: "Force Companion",      emoji: "🌌", signature: "Force Unleashed" },
  grappler:   { key: "grappler",   noun: "Grappler",   label: "Grappler Companion",   emoji: "🤼", signature: "Signature Slam" },
  beast:      { key: "beast",      noun: "Beast",      label: "Beast Companion",      emoji: "🐾", signature: "Primal Rampage" },
};

// Keyword → archetype. Scanned against the lowercased card name. Order matters:
// earlier, more specific matches win.
const KEYWORDS: Array<[ArchetypeKey, string[]]> = [
  ["dragon",     ["dragon", "wyrm", "drake", "wyvern", "charizard", "dragonite", "rayquaza", "salamence"]],
  ["mechanical", ["robot", "mech", "machine", "cyborg", "android", "droid", "golem", "magnezone", "magneton", "magnemite", "genesect", "steel", "metal"]],
  ["celestial",  ["angel", "celestial", "seraph", "divine", "holy", "deity", "fairy", "arceus", "solgaleo", "lunala", "saint"]],
  ["undead",     ["ghost", "undead", "zombie", "skeleton", "demon", "devil", "phantom", "spectre", "specter", "gengar", "spiritomb", "wraith", "reaper"]],
  ["arcane",     ["wizard", "mage", "sorcerer", "sorceress", "witch", "warlock", "arcane", "mystic", "spell", "alakazam", "espeon", "enchant", "rune"]],
  ["buccaneer",  ["pirate", "captain", "buccaneer", "corsair", "luffy", "zoro", "sailor", "marine"]],
  ["jedi",       ["jedi", "sith", "force", "skywalker", "vader", "lightsaber", "padawan"]],
  ["ninja",      ["ninja", "assassin", "shinobi", "greninja", "shadow", "rogue", "stealth"]],
  ["knight",     ["knight", "paladin", "warrior", "soldier", "guardian", "samurai", "gladiator", "crusader", "templar"]],
  ["grappler",   ["wrestler", "wrestling", "machamp", "hitmon", "brawler", "fighter", "champ"]],
  ["feline",     ["cat", "feline", "tiger", "lion", "panther", "leopard", "lynx", "meowth", "persian", "liepard", "incineroar", "litten", "luxray"]],
  ["canine",     ["dog", "wolf", "fox", "hound", "jackal", "lycanroc", "houndoom", "mightyena", "zoroark", "growlithe", "arcanine", "eevee"]],
  ["avian",      ["bird", "eagle", "hawk", "falcon", "raven", "phoenix", "owl", "pidgeot", "talonflame", "ho-oh", "articuno", "moltres", "zapdos"]],
  ["aquatic",    ["fish", "shark", "squid", "octopus", "kraken", "whale", "gyarados", "kingdra", "lapras", "vaporeon", "wailord", "ocean", "aqua"]],
  ["reptile",    ["lizard", "snake", "serpent", "gecko", "turtle", "tortoise", "croc", "cobra", "viper", "blastoise", "venusaur", "sceptile"]],
  ["insect",     ["bug", "beetle", "spider", "scorpion", "mantis", "wasp", "hornet", "scyther", "beedrill", "pinsir", "heracross", "butterfree"]],
  ["elemental",  ["fire", "flame", "ember", "ice", "frost", "storm", "thunder", "lightning", "volt", "earth", "stone", "rock", "magma", "blaze", "spark"]],
  ["hero",       ["hero", "spider-man", "iron", "captain", "thor", "hulk", "avenger", "mutant", "wolverine"]],
  ["beast",      ["beast", "monster", "behemoth", "titan", "ogre", "troll", "brute", "kaiju", "tyrant"]],
];

// Per-category fallback when no keyword matches.
const CATEGORY_FALLBACK: Record<ArenaCategory, ArchetypeKey> = {
  pokemon: "beast", onepiece: "buccaneer", mtg: "arcane", yugioh: "dragon",
  sports: "athlete", lorcana: "arcane", marvel: "hero", starwars: "jedi",
  wrestling: "grappler", other: "beast",
};

export function deriveArchetype(name: string | null | undefined, category: string | null | undefined): Archetype {
  const n = (name ?? "").toLowerCase();
  for (const [key, words] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return ARCHETYPES[key];
  }
  return ARCHETYPES[CATEGORY_FALLBACK[arenaCategoryFor(category)]];
}

export function archetypeByKey(key: string | null | undefined): Archetype {
  return ARCHETYPES[(key as ArchetypeKey)] ?? ARCHETYPES.beast;
}

// ---------------------------------------------------------------------------
// Combat element — drives a companion's ability animation & FX colour so a
// Dragon (fire) fights differently from a Cat (shadow) or a Wizard (magic).
// ---------------------------------------------------------------------------
export type ElementKey =
  | "fire" | "lightning" | "water" | "shadow" | "psychic"
  | "sword" | "magic" | "projectile" | "nature" | "holy";

export type ElementMeta = {
  key: ElementKey;
  label: string;
  emoji: string;
  /** Main glow colour (hex) used for projectiles, bursts and auras. */
  color: string;
  /** Secondary colour for gradients / sparks. */
  glow: string;
  /** CSS class that paints the on-hit element burst overlay. */
  fxClass: string;
  /** Verb used in the round caption ("unleashed", "slashed"…). */
  verb: string;
};

export const ELEMENTS: Record<ElementKey, ElementMeta> = {
  fire:       { key: "fire",       label: "Fire",       emoji: "🔥", color: "#fb7223", glow: "#ffd166", fxClass: "arena-el-fire",       verb: "scorched" },
  lightning:  { key: "lightning",  label: "Lightning",  emoji: "⚡", color: "#38bdf8", glow: "#e0f2ff", fxClass: "arena-el-lightning",  verb: "shocked" },
  water:      { key: "water",      label: "Water",      emoji: "🌊", color: "#22a7f0", glow: "#bfeaff", fxClass: "arena-el-water",      verb: "drenched" },
  shadow:     { key: "shadow",     label: "Shadow",     emoji: "🌑", color: "#7c3aed", glow: "#c4b5fd", fxClass: "arena-el-shadow",     verb: "consumed" },
  psychic:    { key: "psychic",    label: "Psychic",    emoji: "🔮", color: "#ec4899", glow: "#fbcfe8", fxClass: "arena-el-psychic",    verb: "mind-broke" },
  sword:      { key: "sword",      label: "Blade",      emoji: "⚔️", color: "#e2e8f0", glow: "#fef9c3", fxClass: "arena-el-sword",      verb: "slashed" },
  magic:      { key: "magic",      label: "Arcane",     emoji: "✨", color: "#a855f7", glow: "#f5d0fe", fxClass: "arena-el-magic",      verb: "hexed" },
  projectile: { key: "projectile", label: "Strike",     emoji: "🎯", color: "#f59e0b", glow: "#fde68a", fxClass: "arena-el-projectile", verb: "blasted" },
  nature:     { key: "nature",     label: "Nature",     emoji: "🍃", color: "#22c55e", glow: "#bbf7d0", fxClass: "arena-el-nature",     verb: "mauled" },
  holy:       { key: "holy",       label: "Holy",       emoji: "🌟", color: "#fcd34d", glow: "#fffbeb", fxClass: "arena-el-holy",       verb: "smote" },
};

const ARCHETYPE_ELEMENT: Record<ArchetypeKey, ElementKey> = {
  dragon: "fire", feline: "shadow", canine: "nature", avian: "lightning",
  aquatic: "water", reptile: "water", insect: "nature", arcane: "magic",
  celestial: "holy", undead: "shadow", mechanical: "lightning", buccaneer: "sword",
  knight: "sword", ninja: "shadow", elemental: "lightning", athlete: "projectile",
  hero: "projectile", jedi: "psychic", grappler: "sword", beast: "nature",
};

export function archetypeElement(key: ArchetypeKey | null | undefined): ElementMeta {
  return ELEMENTS[ARCHETYPE_ELEMENT[(key as ArchetypeKey)] ?? "projectile"];
}

// ---------------------------------------------------------------------------
// Evolution — a companion's appearance upgrades as it levels up, so players get
// attached and keep grinding. Four visual stages: Lv1 / Lv10 / Lv25 / Lv50.
// ---------------------------------------------------------------------------
export type EvolutionStage = {
  stage: 0 | 1 | 2 | 3;
  key: "rookie" | "evolved" | "elite" | "legendary";
  label: string;
  /** Sprite scale multiplier — bigger, more imposing as it evolves. */
  scale: number;
  /** Extra aura/flair intensity added on top of rarity flair. */
  auraBoost: number;
  /** Level at which the NEXT evolution unlocks (null when maxed). */
  nextAt: number | null;
  color: string;     // tailwind text token
  ring: string;      // tailwind ring classes for the evolved frame
  emoji: string;
};

export const EVOLUTION_STAGES: EvolutionStage[] = [
  { stage: 0, key: "rookie",    label: "Rookie",    scale: 1.0,  auraBoost: 0, nextAt: 10,  color: "text-muted-foreground", ring: "", emoji: "🥚" },
  { stage: 1, key: "evolved",   label: "Evolved",   scale: 1.08, auraBoost: 1, nextAt: 25,  color: "text-sky-500",     ring: "ring-1 ring-sky-400/50", emoji: "🌀" },
  { stage: 2, key: "elite",     label: "Elite",     scale: 1.16, auraBoost: 2, nextAt: 50,  color: "text-fuchsia-500", ring: "ring-2 ring-fuchsia-400/60", emoji: "🔱" },
  { stage: 3, key: "legendary", label: "Legendary", scale: 1.26, auraBoost: 3, nextAt: null, color: "text-amber-500",  ring: "ring-2 ring-amber-400/80 shadow-[0_0_22px_rgba(251,191,36,0.55)]", emoji: "👑" },
];

export function evolutionStage(level: number | null | undefined): EvolutionStage {
  const lv = level ?? 1;
  if (lv >= 50) return EVOLUTION_STAGES[3];
  if (lv >= 25) return EVOLUTION_STAGES[2];
  if (lv >= 10) return EVOLUTION_STAGES[1];
  return EVOLUTION_STAGES[0];
}

// ---------------------------------------------------------------------------
// Rarity tiers — rarer cards unlock more impressive companions.
// ---------------------------------------------------------------------------
export type RarityTierKey = "common" | "uncommon" | "rare" | "ultra" | "legendary";

export type RarityTier = {
  key: RarityTierKey;
  label: string;       // "Basic Companion"
  short: string;       // "Basic"
  /** Multiplier applied to base combat stats. */
  statMult: number;
  /** Flat stat bonus added on top (so rarity always feels meaningful). */
  statBonus: number;
  /** Visual intensity 0-4 used by the sprite to scale aura / flair. */
  flair: number;
  color: string;       // tailwind text color token
  ring: string;        // tailwind ring/border classes for the rarity frame
  emoji: string;
};

export const RARITY_TIERS: Record<RarityTierKey, RarityTier> = {
  common:    { key: "common",    label: "Basic Companion",     short: "Basic",     statMult: 1.0,  statBonus: 0,  flair: 0, color: "text-muted-foreground", ring: "ring-1 ring-border", emoji: "▫️" },
  uncommon:  { key: "uncommon",  label: "Enhanced Companion",  short: "Enhanced",  statMult: 1.08, statBonus: 3,  flair: 1, color: "text-emerald-500", ring: "ring-1 ring-emerald-500/50", emoji: "🔹" },
  rare:      { key: "rare",      label: "Elite Companion",     short: "Elite",     statMult: 1.16, statBonus: 6,  flair: 2, color: "text-sky-500", ring: "ring-2 ring-sky-500/60", emoji: "💠" },
  ultra:     { key: "ultra",     label: "Epic Companion",      short: "Epic",      statMult: 1.26, statBonus: 9,  flair: 3, color: "text-fuchsia-500", ring: "ring-2 ring-fuchsia-500/70 shadow-[0_0_16px_rgba(217,70,239,0.5)]", emoji: "🟣" },
  legendary: { key: "legendary", label: "Legendary Companion", short: "Legendary", statMult: 1.4,  statBonus: 14, flair: 4, color: "text-amber-500", ring: "ring-2 ring-amber-400/80 shadow-[0_0_22px_rgba(251,191,36,0.6)]", emoji: "🌟" },
};

// Map a free-form card rarity string to a canonical tier. Covers Pokémon, MTG,
// Yu-Gi-Oh, One Piece, Lorcana, sports & generic grading vocabulary.
export function rarityTierFromCard(rarity: string | null | undefined): RarityTierKey {
  const r = (rarity ?? "").toLowerCase();
  if (!r) return "common";
  if (/(secret|special illustration|hyper|ghost|mythic|1\s*of\s*1|one of one|god|legendary|crown)/.test(r)) return "legendary";
  if (/(ultra|illustration rare|alt(ernate)? art|full art|secret rare|rainbow|gold|prismatic|serial|sir\b)/.test(r)) return "ultra";
  if (/(double rare|rare holo|holo|super rare|ex\b|gx\b|\bv\b|vmax|vstar|amazing|radiant|prime|leader|epic)/.test(r)) return "rare";
  if (/(uncommon|reverse|promo|short print)/.test(r)) return "uncommon";
  if (/(rare)/.test(r)) return "rare";
  if (/(common|base)/.test(r)) return "common";
  return "common";
}

export function rarityTier(key: string | null | undefined): RarityTier {
  return RARITY_TIERS[(key as RarityTierKey)] ?? RARITY_TIERS.common;
}

// Fallback tier inference from a companion's stat total (for legacy companions
// created before rarity was captured).
export function rarityTierFromStats(total: number): RarityTierKey {
  if (total >= 120) return "legendary";
  if (total >= 95) return "ultra";
  if (total >= 75) return "rare";
  if (total >= 55) return "uncommon";
  return "common";
}

// ---------------------------------------------------------------------------
// Abilities — each companion has a hidden Trait (existing), plus a Passive and
// an active Special. Derived deterministically so no two feel identical.
// ---------------------------------------------------------------------------
const PASSIVE_POOL: Array<{ name: string; desc: string }> = [
  { name: "Thick Hide", desc: "Takes 10% less damage from basic attacks." },
  { name: "Quick Reflexes", desc: "Small chance to dodge incoming hits." },
  { name: "Battle Focus", desc: "Gains attack as the battle goes on." },
  { name: "Regeneration", desc: "Recovers a little health each round." },
  { name: "Last Stand", desc: "Hits harder when health is low." },
  { name: "Lucky Star", desc: "Slightly higher critical-hit chance." },
  { name: "Iron Resolve", desc: "Resists status effects and slows." },
  { name: "Momentum", desc: "Each win in a round boosts the next." },
  { name: "Counterforce", desc: "Reflects a portion of blocked damage." },
  { name: "Adaptive", desc: "Scales its weakest stat up over time." },
];

const SPECIAL_POOL: Array<{ name: string; desc: string }> = [
  { name: "Crushing Blow", desc: "A heavy strike that ignores some defense." },
  { name: "Rally Cry", desc: "Restores health and boosts attack briefly." },
  { name: "Precision Strike", desc: "Guaranteed critical on activation." },
  { name: "Guard Break", desc: "Shatters the foe's defense for a round." },
  { name: "Whirlwind", desc: "Multi-hit flurry of fast attacks." },
  { name: "Fortify", desc: "Greatly raises defense for two rounds." },
];

export type CompanionAbilities = {
  trait: string;           // existing hidden trait (first)
  passive: { name: string; desc: string };
  special: { name: string; desc: string };
};

// Derive the passive + signature special from the card seed and archetype.
// The archetype's signature special is preferred for higher rarity tiers.
export function companionAbilities(
  seedKey: string,
  archetype: Archetype,
  tier: RarityTierKey,
  trait: string,
): CompanionAbilities {
  const s = seedFrom(seedKey);
  const passive = PASSIVE_POOL[s % PASSIVE_POOL.length];
  // Rare+ companions get their archetype signature; commons get a generic move.
  const useSignature = tier === "rare" || tier === "ultra" || tier === "legendary";
  const generic = SPECIAL_POOL[(s >> 9) % SPECIAL_POOL.length];
  const special = useSignature
    ? { name: archetype.signature, desc: `${archetype.noun} signature move — devastating archetype attack.` }
    : generic;
  return { trait, passive, special };
}

// ---------------------------------------------------------------------------
// One-call enrichment used by reads + UI.
// ---------------------------------------------------------------------------
export type CompanionIdentity = {
  archetype: Archetype;
  rarity: RarityTier;
  abilities: CompanionAbilities;
};

export function companionIdentity(input: {
  id: string;
  name: string | null | undefined;
  category: string | null | undefined;
  rarity?: string | null;        // raw card rarity (preferred)
  rarityTierKey?: string | null; // stored tier key (if already resolved)
  statTotal?: number;            // fallback when no rarity available
  trait?: string | null;
}): CompanionIdentity {
  const archetype = deriveArchetype(input.name, input.category);
  const tierKey: RarityTierKey =
    (input.rarityTierKey as RarityTierKey) ??
    (input.rarity ? rarityTierFromCard(input.rarity) :
      input.statTotal != null ? rarityTierFromStats(input.statTotal) : "common");
  const rarity = RARITY_TIERS[tierKey];
  const abilities = companionAbilities(
    `${input.id}:${input.name ?? ""}`,
    archetype,
    tierKey,
    input.trait ?? "First Strike",
  );
  return { archetype, rarity, abilities };
}
