import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TutorialLibrary } from "@/components/tutorials/TutorialLibrary";
import { TutorialPlayer, type Tutorial } from "@/components/tutorials/TutorialPlayer";
import { HeaderSearch } from "@/components/HeaderSearch";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";

type Search = { id?: string; route?: string };

export const Route = createFileRoute("/tutorials")({
  component: TutorialsPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
    route: typeof s.route === "string" ? s.route : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tutorials — PullBid Live" },
      { name: "description", content: "Step-by-step tutorials for buyers, sellers, hosts, and live viewers — with captions and AI voice walkthroughs." },
      { property: "og:title", content: "PullBid Live Tutorials" },
      { property: "og:description", content: "Buyer, seller, host, and live tutorials." },
    ],
  }),
});

function TutorialsPage() {
  const navigate = useNavigate();
  const { id, route } = useSearch({ from: "/tutorials" }) as Search;
  const [auto, setAuto] = useState<Tutorial | null>(null);

  useEffect(() => {
    if (!id && !route) { setAuto(null); return; }
    let cancel = false;
    (async () => {
      let q = supabase.from("tutorials").select("*").eq("is_published", true);
      if (id) q = q.eq("id", id);
      else if (route) q = q.eq("route_path", route);
      const { data } = await q.order("order_index").limit(1).maybeSingle();
      if (!cancel) setAuto(data as Tutorial | null);
    })();
    return () => { cancel = true; };
  }, [id, route]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="sticky top-0 z-30 mx-auto w-full max-w-md border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2"><BackButton /><HeaderSearch className="flex-1" /></div>
      </div>
      <h1 className="sr-only">Tutorials</h1>
      <TutorialLibrary onBack={() => navigate({ to: "/" })} />
      {auto && (
        <TutorialPlayer
          tutorial={auto}
          onClose={() => { setAuto(null); navigate({ to: "/tutorials", search: {} as any, replace: true }); }}
        />
      )}
    </main>
  );
}
