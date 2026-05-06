// CSS filters applied to the host's <video> / HLS player element on Flex Live.
// Designed to be playful but performant — pure CSS, no GPU/WebGL needed.
export type FlexFilterId =
  | "none"
  | "vibrant"
  | "retro"
  | "noir"
  | "holo"
  | "dream"
  | "sunset"
  | "ice"
  | "candy"
  // 🤖 AI face-style looks (CSS-based approximations — playful, no GPU/WebGL)
  | "anime"
  | "comic"
  | "glow_skin"
  | "vhs_face"
  | "cyber";

export const FLEX_FILTERS: { id: FlexFilterId; label: string; emoji: string; css: string }[] = [
  { id: "none",      label: "Off",      emoji: "🚫", css: "none" },
  { id: "vibrant",   label: "Vibrant",  emoji: "🌈", css: "saturate(1.55) contrast(1.1)" },
  { id: "retro",     label: "Retro",    emoji: "📼", css: "sepia(0.45) contrast(1.05) saturate(1.1) hue-rotate(-10deg)" },
  { id: "noir",      label: "Noir",     emoji: "🎬", css: "grayscale(1) contrast(1.15) brightness(0.95)" },
  { id: "holo",      label: "Holo",     emoji: "💎", css: "saturate(1.8) hue-rotate(20deg) contrast(1.1) brightness(1.05)" },
  { id: "dream",     label: "Dream",    emoji: "💭", css: "blur(0.4px) saturate(1.3) brightness(1.08) contrast(0.95)" },
  { id: "sunset",    label: "Sunset",   emoji: "🌅", css: "saturate(1.4) hue-rotate(-18deg) sepia(0.15) brightness(1.05)" },
  { id: "ice",       label: "Ice",      emoji: "❄️",  css: "saturate(0.9) hue-rotate(180deg) brightness(1.05) contrast(1.05)" },
  { id: "candy",     label: "Candy",    emoji: "🍭", css: "saturate(1.7) hue-rotate(310deg) brightness(1.06)" },
  // AI face filters
  { id: "anime",     label: "Anime",    emoji: "✨", css: "saturate(1.9) contrast(1.25) brightness(1.08)" },
  { id: "comic",     label: "Comic",    emoji: "💥", css: "contrast(1.6) saturate(1.4) brightness(1.05)" },
  { id: "glow_skin", label: "Glow",     emoji: "🌟", css: "brightness(1.12) saturate(1.2) blur(0.3px) contrast(0.97)" },
  { id: "vhs_face",  label: "VHS",      emoji: "📺", css: "saturate(1.3) hue-rotate(-8deg) contrast(1.1) blur(0.5px)" },
  { id: "cyber",     label: "Cyber",    emoji: "🦾", css: "saturate(1.6) hue-rotate(190deg) contrast(1.2) brightness(1.05)" },
];

export function flexFilterCss(id: string | null | undefined): string {
  const f = FLEX_FILTERS.find((x) => x.id === (id || "none"));
  return f ? f.css : "none";
}

// 🎉 Weekly Vibe — rotates each ISO week so Flex Live feels fresh.
// Hosts and viewers see the same prompt for the week.
const VIBES = [
  { theme: "Show your rookie!",        emoji: "🌟", color: "from-fuchsia-500 to-violet-500" },
  { theme: "Mystery slab Monday",      emoji: "🔮", color: "from-indigo-500 to-purple-500" },
  { theme: "Retro pulls only",         emoji: "📼", color: "from-amber-500 to-rose-500" },
  { theme: "Holo flex",                emoji: "💎", color: "from-cyan-500 to-blue-500" },
  { theme: "Pull of the week",         emoji: "🎯", color: "from-emerald-500 to-teal-500" },
  { theme: "Childhood favorites",      emoji: "🧸", color: "from-pink-500 to-rose-500" },
  { theme: "PC heat check",            emoji: "🔥", color: "from-orange-500 to-red-500" },
  { theme: "Trade tales",              emoji: "🤝", color: "from-lime-500 to-emerald-500" },
  { theme: "Grail goals",              emoji: "🏆", color: "from-yellow-500 to-amber-500" },
  { theme: "Vintage vault",            emoji: "🗝️", color: "from-stone-500 to-amber-700" },
  { theme: "Color rush — pick a hue",  emoji: "🎨", color: "from-pink-500 via-purple-500 to-cyan-500" },
  { theme: "Anime arc",                emoji: "🗡️", color: "from-rose-500 to-fuchsia-500" },
  { theme: "Sports legends",           emoji: "🏅", color: "from-blue-500 to-indigo-600" },
];

function isoWeek(d = new Date()): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function weeklyVibe() {
  const w = isoWeek();
  return VIBES[w % VIBES.length];
}

export const FLEX_REACTIONS = ["🔥", "💎", "😂", "🤯", "💜", "🎉", "👀", "🫡"];
