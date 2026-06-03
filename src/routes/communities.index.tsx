import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { listCommunities, listMyCommunityIds, joinCommunity, leaveCommunity } from "@/lib/communities.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/communities/")({
  head: () => ({
    meta: [
      { title: "Communities — PullBid Live" },
      { name: "description", content: "Join official collector communities for Pokémon, One Piece, Magic, Sports and more. Share pulls, trade, and complete sets together." },
      { property: "og:title", content: "Communities — PullBid Live" },
      { property: "og:description", content: "Official per-category collector communities with feeds, trades, and challenges." },
    ],
  }),
  component: CommunitiesPage,
});

function CommunitiesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listCommunities);
  const mine = useServerFn(listMyCommunityIds);
  const join = useServerFn(joinCommunity);
  const leave = useServerFn(leaveCommunity);

  const communities = useQuery({ queryKey: ["communities"], queryFn: () => list() });
  const myIds = useQuery({ queryKey: ["my-community-ids"], queryFn: () => mine(), enabled: !!user });

  const joinMut = useMutation({
    mutationFn: (id: string) => join({ data: { communityId: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-community-ids"] }); qc.invalidateQueries({ queryKey: ["communities"] }); toast.success("Joined community"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const leaveMut = useMutation({
    mutationFn: (id: string) => leave({ data: { communityId: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-community-ids"] }); qc.invalidateQueries({ queryKey: ["communities"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const joined = new Set(myIds.data ?? []);
  const items = communities.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <header className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Communities</h1>
            <p className="text-xs text-muted-foreground">Official hubs for every collector category. Share, trade, and grow together.</p>
          </div>
        </header>

        {communities.isLoading && <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((c) => {
            const isMember = joined.has(c.id);
            return (
              <Card key={c.id} className="flex flex-col p-4">
                <Link to="/communities/$slug" params={{ slug: c.slug }} className="flex items-start gap-3">
                  <span className="text-3xl">{c.emoji ?? "✨"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                  </div>
                </Link>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1 text-[11px]"><Users className="h-3 w-3" /> {c.member_count} · {c.post_count} posts</Badge>
                  {user ? (
                    isMember ? (
                      <Button size="sm" variant="outline" onClick={() => leaveMut.mutate(c.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Joined
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => joinMut.mutate(c.id)} disabled={joinMut.isPending}>Join</Button>
                    )
                  ) : (
                    <Button size="sm" asChild><Link to="/auth">Join</Link></Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
