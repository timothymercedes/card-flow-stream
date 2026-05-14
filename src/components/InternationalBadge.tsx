import { Globe2 } from "lucide-react";

export function InternationalBadge({ enabled, className = "" }: { enabled?: boolean | null; className?: string }) {
  if (!enabled) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary ${className}`}
      title="Ships internationally"
    >
      <Globe2 className="h-3 w-3" />
      Ships Worldwide
    </span>
  );
}
