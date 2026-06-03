// PullBid Arena — social feed. Collectors share battles; others can like,
// comment, and watch the replay. Gives users a reason to watch battles.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getArenaFeed, likeFeedPost, getFeedComments, commentOnFeedPost,
} from "@/lib/arena.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, PlayCircle, Swords } from "lucide-react";
import { toast } from "sonner";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Comments({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const commentsFn = useServerFn(getFeedComments);
  const addFn = useServerFn(commentOnFeedPost);
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["arena", "feed", "comments", postId],
    queryFn: () => commentsFn({ data: { postId } }),
  });

  const addM = useMutation({
    mutationFn: (text: string) => addFn({ data: { postId, body: text } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["arena", "feed", "comments", postId] });
      qc.invalidateQueries({ queryKey: ["arena", "feed"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not post comment"),
  });

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {(q.data?.comments ?? []).map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <Avatar className="h-6 w-6"><AvatarImage src={c.avatar_url ?? undefined} /><AvatarFallback>{c.username[0]?.toUpperCase()}</AvatarFallback></Avatar>
          <div className="text-sm">
            <span className="font-medium">{c.username}</span>{" "}
            <span className="text-muted-foreground">{c.body}</span>
          </div>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) addM.mutate(body.trim()); }}
      >
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={280} />
        <Button type="submit" size="sm" disabled={addM.isPending || !body.trim()}>Post</Button>
      </form>
    </div>
  );
}

export function ArenaFeed({ onWatchReplay }: { onWatchReplay: (battleId: string) => void }) {
  const qc = useQueryClient();
  const feedFn = useServerFn(getArenaFeed);
  const likeFn = useServerFn(likeFeedPost);
  const [openComments, setOpenComments] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["arena", "feed"], queryFn: () => feedFn() });

  const likeM = useMutation({
    mutationFn: (vars: { postId: string; like: boolean }) => likeFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arena", "feed"] }),
    onError: (e: any) => toast.error(e?.message || "Could not update like"),
  });

  if (q.isLoading) return <Card className="p-8 text-center text-muted-foreground">Loading feed…</Card>;
  const posts = q.data?.posts ?? [];
  if (posts.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <Swords className="mx-auto mb-2 h-8 w-8 text-primary" />
        No shared battles yet. Win a battle and post it to the feed!
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex-1">
              <div className="text-sm font-semibold">{p.username}</div>
              <div className="text-xs text-muted-foreground">{timeAgo(p.created_at)}</div>
            </div>
            <Badge variant={p.won ? "default" : "secondary"}>{p.won ? "Victory" : "Defeat"}</Badge>
          </div>

          <p className="mt-3 text-sm">
            {p.caption || (
              <>
                <span className="font-medium">{p.companion_name ?? "Their companion"}</span>
                {p.won ? " defeated " : " battled "}
                <span className="font-medium">{p.opponent_name ?? "an opponent"}</span> in the Arena.
              </>
            )}
          </p>

          {p.image_url && (
            <img src={p.image_url} alt={p.companion_name ?? "Companion"} className="mt-3 h-40 w-full rounded-lg object-cover" loading="lazy" />
          )}

          <div className="mt-3 flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => likeM.mutate({ postId: p.id, like: !p.likedByMe })}
              className={p.likedByMe ? "text-rose-500" : ""}
            >
              <Heart className={`mr-1 h-4 w-4 ${p.likedByMe ? "fill-current" : ""}`} />{p.like_count}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpenComments(openComments === p.id ? null : p.id)}>
              <MessageCircle className="mr-1 h-4 w-4" />{p.comment_count}
            </Button>
            {p.battle_id && (
              <Button variant="ghost" size="sm" onClick={() => onWatchReplay(p.battle_id!)}>
                <PlayCircle className="mr-1 h-4 w-4" />Watch
              </Button>
            )}
          </div>

          {openComments === p.id && <Comments postId={p.id} />}
        </Card>
      ))}
    </div>
  );
}
