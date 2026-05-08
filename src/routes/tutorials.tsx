import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TutorialLibrary } from "@/components/tutorials/TutorialLibrary";
import { HeaderSearch } from "@/components/HeaderSearch";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/tutorials")({
  component: TutorialsPage,
  head: () => ({
    meta: [
      { title: "Tutorials — PullBid Live" },
      { name: "description", content: "Learn how to buy, sell, host, and run live auctions on PullBid Live with short video tutorials." },
      { property: "og:title", content: "PullBid Live Tutorials" },
      { property: "og:description", content: "Step-by-step videos for buyers, sellers, and live hosts." },
    ],
  }),
});

function TutorialsPage() {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="sticky top-0 z-30 mx-auto w-full max-w-md border-b border-border bg-background/95 px-4 py-2 backdrop-blur"><HeaderSearch /></div>
      <h1 className="sr-only">Tutorials</h1>
      <TutorialLibrary onBack={() => navigate({ to: "/" })} />
    </main>
  );
}
