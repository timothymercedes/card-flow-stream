import { ImageOff } from "lucide-react";

// Standard placeholder shown when no official card image is available.
// We never generate AI artwork for missing cards — official images only.
export function CardImageUnavailable({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground ${className}`}>
      <ImageOff className="h-6 w-6 opacity-50" />
      <span className="text-[9px]">Image unavailable</span>
    </div>
  );
}
