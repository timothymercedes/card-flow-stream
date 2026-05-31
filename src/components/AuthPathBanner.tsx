import { useEffect, useState } from "react";
import { describeAuthPaths } from "@/lib/nativeAuth";

/**
 * On-device diagnostic banner showing which authentication path Google/Apple
 * will use right now (native sheet vs browser fallback). Visible in dev and in
 * native shells (TestFlight / internal builds) so testers can confirm the fix
 * without reading logs. Hidden on the production web build.
 */
export function AuthPathBanner() {
  const [info, setInfo] = useState<ReturnType<typeof describeAuthPaths> | null>(null);

  useEffect(() => {
    try {
      setInfo(describeAuthPaths());
    } catch {
      setInfo(null);
    }
  }, []);

  if (!info) return null;

  // Show in native shells always; on web only in dev.
  const show = info.native || import.meta.env.DEV;
  if (!show) return null;

  const Row = ({ label, native, path }: { label: string; native: boolean; path: string }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={native ? "font-semibold text-primary" : "font-semibold text-amber-500"}>
        {native ? "✅ " : "⚠️ "}
        {path}
      </span>
    </div>
  );

  return (
    <div className="mb-4 rounded-xl border border-border bg-card/60 p-3 text-[11px] leading-relaxed">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-muted-foreground">Auth path (diagnostic)</span>
        <span className="text-muted-foreground">{info.native ? `native · ${info.platform}` : "web"}</span>
      </div>
      <Row label="Google" native={info.google.native} path={info.google.path} />
      <Row label="Apple" native={info.apple.native} path={info.apple.path} />
      {!(info.google.native && info.apple.native) && (
        <p className="mt-1.5 text-amber-500">
          Missing client IDs — IDs present: web {info.ids.googleWeb ? "✓" : "✗"} · ios{" "}
          {info.ids.googleIos ? "✓" : "✗"} · apple {info.ids.appleServices ? "✓" : "✗"}
        </p>
      )}
    </div>
  );
}
