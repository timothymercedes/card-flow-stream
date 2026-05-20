import { useEffect, useRef, useState } from "react";
import { Settings2, X, RotateCcw } from "lucide-react";
import type { CameraSettings, StudioSource } from "@/hooks/useStudio";

type Props = {
  source: StudioSource;
  capabilities: any;
  onUpdate: (patch: CameraSettings) => void;
  onSetFit: (fit: "cover" | "contain") => void;
};

const RES_PRESETS = [
  { label: "1920×1080", w: 1920, h: 1080 },
  { label: "1280×720", w: 1280, h: 720 },
  { label: "640×480", w: 640, h: 480 },
];
const FPS_PRESETS = [30, 60];
const ASPECT_PRESETS: { label: string; value: number | undefined }[] = [
  { label: "Auto", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
];

export function CameraSettingsPopover({ source, capabilities, onUpdate, onSetFit }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = source.settings ?? {};

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasZoom = !!capabilities?.zoom;
  const zoomMin = capabilities?.zoom?.min ?? 1;
  const zoomMax = capabilities?.zoom?.max ?? 3;
  const zoomStep = capabilities?.zoom?.step ?? 0.1;
  const hasFocus = Array.isArray(capabilities?.focusMode);
  const hasManualFocus = hasFocus && capabilities.focusMode.includes("manual");
  const focusMin = capabilities?.focusDistance?.min ?? 0;
  const focusMax = capabilities?.focusDistance?.max ?? 1;
  const focusStep = capabilities?.focusDistance?.step ?? 0.01;

  function reset() {
    onUpdate({
      width: undefined, height: undefined, frameRate: undefined, aspectRatio: undefined,
      zoom: zoomMin, focusMode: "continuous", focusDistance: undefined,
      brightness: 1, contrast: 1, saturation: 1, sharpness: 1,
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 hover:bg-muted"
        title="Camera settings"
      >
        <Settings2 className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-popover p-3 text-[11px] shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {source.label}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={reset} className="rounded p-1 hover:bg-muted" title="Reset">
                <RotateCcw className="h-3 w-3" />
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted" title="Close">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Resolution */}
          <Field label="Resolution">
            <div className="flex flex-wrap gap-1">
              {RES_PRESETS.map((p) => (
                <Chip
                  key={p.label}
                  active={s.width === p.w && s.height === p.h}
                  onClick={() => onUpdate({ width: p.w, height: p.h })}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </Field>

          {/* FPS */}
          <Field label="Frame rate">
            <div className="flex gap-1">
              {FPS_PRESETS.map((f) => (
                <Chip key={f} active={s.frameRate === f} onClick={() => onUpdate({ frameRate: f })}>
                  {f}fps
                </Chip>
              ))}
            </div>
          </Field>

          {/* Aspect */}
          <Field label="Aspect ratio">
            <div className="flex gap-1">
              {ASPECT_PRESETS.map((a) => (
                <Chip
                  key={a.label}
                  active={
                    (a.value === undefined && !s.aspectRatio) ||
                    (a.value !== undefined && Math.abs((s.aspectRatio ?? 0) - a.value) < 0.01)
                  }
                  onClick={() => onUpdate({ aspectRatio: a.value })}
                >
                  {a.label}
                </Chip>
              ))}
            </div>
          </Field>

          {/* Video fit */}
          <Field label="Video fit">
            <div className="flex gap-1">
              <Chip active={source.fit === "contain"} onClick={() => onSetFit("contain")}>Contain</Chip>
              <Chip active={source.fit === "cover"} onClick={() => onSetFit("cover")}>Cover</Chip>
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">
              Contain shows the full camera (no crop). Cover fills the tile and crops the edges.
            </p>
          </Field>

          {/* Zoom */}
          {hasZoom ? (
            <Slider
              label={`Zoom (${(s.zoom ?? zoomMin).toFixed(1)}×)`}
              min={zoomMin} max={zoomMax} step={zoomStep}
              value={s.zoom ?? zoomMin}
              onChange={(v) => onUpdate({ zoom: v })}
            />
          ) : (
            <p className="mb-1 text-[9px] italic text-muted-foreground">Zoom not supported on this camera.</p>
          )}

          {/* Focus */}
          {hasFocus && (
            <Field label="Focus">
              <div className="flex gap-1">
                <Chip
                  active={s.focusMode !== "manual"}
                  onClick={() => onUpdate({ focusMode: "continuous" })}
                >
                  Auto
                </Chip>
                {hasManualFocus && (
                  <Chip
                    active={s.focusMode === "manual"}
                    onClick={() => onUpdate({ focusMode: "manual" })}
                  >
                    Manual
                  </Chip>
                )}
              </div>
              {s.focusMode === "manual" && hasManualFocus && (
                <Slider
                  label="Distance"
                  min={focusMin} max={focusMax} step={focusStep}
                  value={s.focusDistance ?? focusMin}
                  onChange={(v) => onUpdate({ focusDistance: v })}
                />
              )}
            </Field>
          )}

          {/* Brightness / Contrast / Saturation / Sharpness */}
          <Slider label={`Brightness (${(s.brightness ?? 1).toFixed(2)})`} min={0.5} max={1.5} step={0.05}
            value={s.brightness ?? 1} onChange={(v) => onUpdate({ brightness: v })} />
          <Slider label={`Contrast (${(s.contrast ?? 1).toFixed(2)})`} min={0.5} max={1.5} step={0.05}
            value={s.contrast ?? 1} onChange={(v) => onUpdate({ contrast: v })} />
          <Slider label={`Saturation (${(s.saturation ?? 1).toFixed(2)})`} min={0} max={2} step={0.05}
            value={s.saturation ?? 1} onChange={(v) => onUpdate({ saturation: v })} />
          <Slider label={`Sharpness (${(s.sharpness ?? 1).toFixed(2)})`} min={0.5} max={1.5} step={0.05}
            value={s.sharpness ?? 1} onChange={(v) => onUpdate({ sharpness: v })} />

          <p className="mt-2 text-[9px] text-muted-foreground">
            Settings are saved for this camera and reapplied next time.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[10px] font-semibold ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {children}
    </button>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
