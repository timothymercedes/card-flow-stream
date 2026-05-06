import { useState } from "react";
import { X } from "lucide-react";
import { STREAM_TYPES, TCG_TAGS, type StreamType, type TcgTag } from "@/lib/streamTaxonomy";

type Props = {
  open: boolean;
  initialType?: StreamType;
  lockType?: boolean; // e.g. forced to show_off
  initialTags?: TcgTag[];
  onCancel: () => void;
  onConfirm: (v: { stream_type: StreamType; tcg_tags: TcgTag[] }) => void;
  title?: string;
};

export function StreamCategoryPicker({ open, initialType = "auction", lockType, initialTags = [], onCancel, onConfirm, title = "Categorize your stream" }: Props) {
  const [type, setType] = useState<StreamType>(initialType);
  const [tags, setTags] = useState<TcgTag[]>(initialTags);
  if (!open) return null;
  const toggle = (t: TcgTag) => setTags((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  const canSubmit = tags.length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">{title}</p>
          <button onClick={onCancel}><X className="h-4 w-4" /></button>
        </div>

        {!lockType && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">Stream type</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STREAM_TYPES.map((s) => (
                <button key={s.value} onClick={() => setType(s.value)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold ${type === s.value ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">TCG / category focus <span className="text-destructive">*</span> (pick 1+)</p>
          <div className="flex flex-wrap gap-1.5">
            {TCG_TAGS.map((t) => (
              <button key={t.value} onClick={() => toggle(t.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tags.includes(t.value) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!canSubmit}
          onClick={() => onConfirm({ stream_type: type, tcg_tags: tags })}
          className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {canSubmit ? "Continue" : "Pick at least one TCG tag"}
        </button>
      </div>
    </div>
  );
}
