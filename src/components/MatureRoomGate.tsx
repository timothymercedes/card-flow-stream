import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isMatureStream } from "@/lib/streamTaxonomy";

/** One-tap advisory shown before a viewer enters a room the host flagged for mature language. */
export function MatureRoomGate({ streamId, tags, isHost }: { streamId: string; tags: readonly string[] | null | undefined; isHost?: boolean }) {
  const key = `mature-ok:${streamId}`;
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(!!isHost || sessionStorage.getItem(key) === "1"); }, [key, isHost]);
  if (ok || !isMatureStream(tags)) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="mature-title" className="fixed inset-0 z-[300] flex items-center justify-center bg-background/90 p-4 backdrop-blur">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 id="mature-title" className="mt-3 text-lg font-bold">Heads up — mature room</h2>
        <p className="mt-2 text-sm text-muted-foreground">The host says this room may contain strong language or adult conversation. Enter only if you're comfortable with that.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button asChild variant="outline"><Link to="/showoff">Go back</Link></Button>
          <Button onClick={() => { sessionStorage.setItem(key, "1"); setOk(true); }}>Enter room</Button>
        </div>
      </div>
    </div>
  );
}
