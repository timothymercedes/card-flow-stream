import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { getOrCreateAiCardImage } from "@/lib/cardImage.functions";

export type AiCardIdentity = {
  category?: string | null;
  setName?: string | null;
  number?: string | null;
  name?: string | null;
  rarity?: string | null;
};

// Renders an AI-generated preview of a trading card. The image is generated
// once per unique card and cached server-side, so repeat views are instant.
export function AiCardImage({
  card,
  alt,
  className = "",
}: {
  card: AiCardIdentity;
  alt: string;
  className?: string;
}) {
  const gen = useServerFn(getOrCreateAiCardImage);
  const id = {
    category: card.category ?? "",
    setName: card.setName ?? "",
    number: card.number ?? "",
    name: card.name ?? "",
    rarity: card.rarity ?? "",
  };

  const q = useQuery({
    queryKey: ["ai-card-image", id.category, id.setName, id.number, id.name],
    queryFn: () => gen({ data: id }),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  if (q.data?.url) {
    return <img src={q.data.url} alt={alt} className={className} loading="lazy" />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
      <Sparkles className={`h-6 w-6 text-primary ${q.isLoading || q.isFetching ? "animate-pulse" : "opacity-50"}`} />
      <span className="text-[9px]">{q.isLoading || q.isFetching ? "Generating art…" : "Art unavailable"}</span>
    </div>
  );
}
