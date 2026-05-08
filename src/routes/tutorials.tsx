import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TutorialLibrary } from "@/components/tutorials/TutorialLibrary";
import { HeaderSearch } from "@/components/HeaderSearch";

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
      <h1 className="sr-only">Tutorials</h1>
      <TutorialLibrary onBack={() => navigate({ to: "/" })} />
    </main>
  );
}
