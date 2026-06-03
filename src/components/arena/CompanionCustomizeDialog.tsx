// PullBid Arena — per-companion visual mode + custom appearance builder.
// Three modes:
//  1. Card     — show the real card art as the avatar (fastest, safest).
//  2. Inspired — the procedural fighter derived from the card (default).
//  3. Custom   — Inspired sprite with player-chosen colors + headgear.
import { useMemo, useState } from "react";
import { CompanionSprite, HEADGEAR_OPTIONS, type HeadgearOverride } from "@/components/arena/CompanionSprite";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, ImageIcon, Wand2, Check } from "lucide-react";

export type VisualMode = "card" | "inspired" | "custom";

type Custom = { body?: string; accent?: string; head?: string };

type CompanionLike = {
  id: string;
  name: string;
  arena_category: string;
  image_url?: string | null;
  level: number;
  archetype: { key: any; label: string; emoji: string };
  rarity: { flair: number };
  cosmetics?: Record<string, any> | null;
};

const BODY_SWATCHES = [
  "#f5b301", "#d23b3b", "#6c4bd6", "#1f8f4e", "#2aa6b8",
  "#d4242e", "#3a3f4b", "#c2410c", "#7c5cff", "#0ea5e9",
  "#ec4899", "#84cc16",
];
const ACCENT_SWATCHES = [
  "#3b6fd4", "#f2b705", "#b3262d", "#ef6c00", "#39d0d8",
  "#22d3ee", "#facc15", "#a855f7", "#10b981", "#f43f5e",
];

const HEAD_LABEL: Record<string, string> = {
  ears: "Ears", hat: "Straw Hat", wizard: "Wizard", horns: "Horns", band: "Headband",
  crown: "Crown", mask: "Mask", helmet: "Helmet", antenna: "Antenna", catears: "Cat Ears",
  wolfears: "Wolf Ears", draconic: "Dragon Horns", beak: "Beak", halo: "Halo", visor: "Visor",
  pirate: "Pirate Hat", hood: "Hood", skull: "Skull",
};

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 w-7 rounded-full border-2 transition ${active ? "border-foreground scale-110" : "border-border/40 hover:scale-105"}`}
      style={{ backgroundColor: color }}
      aria-label={`Color ${color}`}
    >
      {active && <Check className="mx-auto h-3.5 w-3.5 text-white drop-shadow" />}
    </button>
  );
}

function ModeButton({ active, icon: Icon, label, sub, onClick }: {
  active: boolean; icon: any; label: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border p-2 text-center transition ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
    >
      <Icon className={`mx-auto mb-1 h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{sub}</div>
    </button>
  );
}

export function CompanionCustomizeDialog({
  companion, open, onOpenChange, onSave, saving,
}: {
  companion: CompanionLike | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (mode: VisualMode, custom: Custom) => void;
  saving: boolean;
}) {
  const cm = companion?.cosmetics ?? {};
  const initialMode: VisualMode = (cm.visual_mode as VisualMode) ?? "inspired";
  const [mode, setMode] = useState<VisualMode>(initialMode);
  const [custom, setCustom] = useState<Custom>((cm.custom as Custom) ?? {});

  // Reset local state whenever a different companion opens.
  const key = companion?.id ?? "none";
  const seededKey = useMemo(() => key, [key]);
  const [lastKey, setLastKey] = useState(seededKey);
  if (lastKey !== seededKey) {
    setLastKey(seededKey);
    setMode(initialMode);
    setCustom((cm.custom as Custom) ?? {});
  }

  if (!companion) return null;

  const usingCustom = mode === "custom";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Customize {companion.name}
          </DialogTitle>
        </DialogHeader>

        {/* Live preview */}
        <div className="flex items-center justify-center rounded-xl border bg-gradient-to-b from-muted/40 to-background py-4">
          {mode === "card" && companion.image_url ? (
            <img
              src={companion.image_url}
              alt={`${companion.name} card`}
              className="h-32 w-auto rounded-md object-contain shadow"
            />
          ) : (
            <CompanionSprite
              seedKey={`${companion.id}:${companion.name}`}
              category={companion.arena_category}
              archetypeKey={companion.archetype.key}
              anim="victory"
              level={companion.level}
              flair={companion.rarity.flair}
              size={130}
              bodyColor={usingCustom ? custom.body : undefined}
              accentColor={usingCustom ? custom.accent : undefined}
              headgear={usingCustom ? (custom.head as HeadgearOverride | undefined) : undefined}
            />
          )}
        </div>

        {/* Mode selector */}
        <div className="flex gap-2">
          <ModeButton active={mode === "card"} icon={ImageIcon} label="Card" sub="Real card art"
            onClick={() => setMode("card")} />
          <ModeButton active={mode === "inspired"} icon={Sparkles} label="Inspired" sub="Card fighter"
            onClick={() => setMode("inspired")} />
          <ModeButton active={mode === "custom"} icon={Wand2} label="Custom" sub="Your style"
            onClick={() => setMode("custom")} />
        </div>

        {mode === "card" && !companion.image_url && (
          <p className="text-center text-xs text-muted-foreground">No card art available — Inspired mode will be used.</p>
        )}

        {/* Custom builder */}
        {usingCustom && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold">Body color</p>
              <div className="flex flex-wrap gap-2">
                {BODY_SWATCHES.map((c) => (
                  <Swatch key={c} color={c} active={custom.body === c}
                    onClick={() => setCustom((p) => ({ ...p, body: p.body === c ? undefined : c }))} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold">Accent color</p>
              <div className="flex flex-wrap gap-2">
                {ACCENT_SWATCHES.map((c) => (
                  <Swatch key={c} color={c} active={custom.accent === c}
                    onClick={() => setCustom((p) => ({ ...p, accent: p.accent === c ? undefined : c }))} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold">Headgear</p>
              <div className="flex flex-wrap gap-1.5">
                {HEADGEAR_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setCustom((p) => ({ ...p, head: p.head === h ? undefined : h }))}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition ${custom.head === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}
                  >
                    {HEAD_LABEL[h] ?? h}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Leave blank to keep the card-derived look.</p>
            </div>
          </div>
        )}

        <Button className="w-full" disabled={saving} onClick={() => onSave(mode, usingCustom ? custom : {})}>
          {saving ? "Saving…" : "Save appearance"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
