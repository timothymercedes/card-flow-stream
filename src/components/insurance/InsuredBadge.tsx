import { Shield } from "lucide-react";

export function InsuredBadge({ provider }: { provider?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
      <Shield className="h-3 w-3" />
      Insured{provider ? ` · ${provider}` : ""}
    </span>
  );
}
