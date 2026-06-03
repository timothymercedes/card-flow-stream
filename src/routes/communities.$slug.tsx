import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
  getCommunity, getCommunityFeed, listMyCommunityIds, joinCommunity, leaveCommunity,
  createPost, deletePost, toggleLike, getComments, addComment,
} from "@/lib/communities.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Heart, MessageCircle, Trash2, ArrowLeft, Check, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/communities/$slug")({
  component: CommunityDetailPage,
});

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function CommunityDetailPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const get = useServerFn(getCommunity);
  const feed = useServerFn(getCommunityFeed);
  const mine = useServerFn(listMyCommunityIds);
  const join = useServerFn(joinCommunity);
  const leave = useServerFn(leaveCommunity);
  const post = useServerFn(createPost);
  const del = useServerFn(deletePost);
  const like = useServerFn(toggleLike);

  const communityQ = useQuery({ queryKey: ["community", slug], queryFn: () => get({ data: { slug } }) });
  const community = communityQ.data;
  const feedQ = useQuery({
    queryKey: ["community-feed", community?.id, user?.id],
    queryFn: () => feed({ data: { communityId: community!.id, viewerId: user?.id ?? null } }),
    enabled: !!community,
  });
  const myIds = useQuery({ queryKey: ["my-community-ids"], queryFn: () => mine(), enabled: !!user });
  const isMember = !!community && new Set(myIds.data ?? []).has(community.id);

  const [body, setBody] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["community-feed", community?.id] });
    qc.invalidateQueries({ queryKey: ["community", slug] });
  };

  const joinMut = useMutation({
    mutationFn: () => join({ data: { communityId: community!.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-community-ids"] }); invalidate(); toast.success("Joined community"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const leaveMut = useMutation({
    mutationFn: () => leave({ data: { communityId: community!.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-community-ids"] }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const postMut = useMutation({
    mutationFn: () => post({ data: { communityId: community!.id, body: body.trim() } }),
    onSuccess: () => { setBody(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (postId: string) => del({ data: { postId } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const likeMut = useMutation({
    mutationFn: (v: { postId: string; like: boolean }) => like({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (communityQ.isLoading) {
    return <AppShell><p className="py-16 text-center text-sm text-muted-foreground">Loading…</p></AppShell>;
  }
  if (!community) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-8 text-center">
          <p className="font-medium">Community not found</p>
          <Button asChild className="mt-4"><Link to="/communities">Back to communities</Link></Button>
        </div>
      </AppShell>
    );
  }

  const posts = feedQ.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Link to="/communities" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Communities
        </Link>

        <Card className="flex items-start gap-3 p-4">
          <span className="text-4xl">{community.emoji ?? "✨"}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">{community.name}</h1>
            <p className="text-xs text-muted-foreground">{community.description}</p>
            <Badge variant="secondary" className="mt-2 gap-1 text-[11px]"><Users className="h-3 w-3" /> {community.member_count} members · {community.post_count} posts</Badge>
          </div>
          {user ? (
            isMember ? (
              <Button size="sm" variant="outline" onClick={() => leaveMut.mutate()}><Check className="mr-1 h-3.5 w-3.5" /> Joined</Button>
            ) : (
              <Button size="sm" onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>Join</Button>
            )
          ) : (
            <Button size="sm" asChild><Link to="/auth">Join</Link></Button>
          )}
        </Card>

        {user && isMember && (
          <Card className="space-y-2 p-3">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Share something with ${community.name}…`} rows={3} maxLength={4000} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => postMut.mutate()} disabled={!body.trim() || postMut.isPending}>Post</Button>
            </div>
          </Card>
        )}
        {user && !isMember && (
          <p className="text-center text-xs text-muted-foreground">Join this community to post.</p>
        )}

        {feedQ.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading feed…</p>}
        {!feedQ.isLoading && posts.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No posts yet. Be the first to share!</Card>
        )}

        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              canDelete={user?.id === p.user_id}
              onDelete={() => delMut.mutate(p.id)}
              onToggleLike={() => likeMut.mutate({ postId: p.id, like: !p.liked_by_me })}
              canInteract={!!user}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

type FeedPost = Awaited<ReturnType<typeof getCommunityFeed>>[number];

function PostCard({ post, canDelete, onDelete, onToggleLike, canInteract }: {
  post: FeedPost; canDelete: boolean; onDelete: () => void; onToggleLike: () => void; canInteract: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8">
          {post.author_avatar ? <AvatarImage src={post.author_avatar} alt={post.author_username} /> : null}
          <AvatarFallback>{post.author_username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{post.author_username}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{post.body}</p>
          {post.image_url && <img src={post.image_url} alt="" className="mt-2 max-h-80 rounded-lg object-cover" loading="lazy" />}
          <div className="mt-2 flex items-center gap-4 text-muted-foreground">
            <button onClick={onToggleLike} disabled={!canInteract} className={`flex items-center gap-1 text-xs ${post.liked_by_me ? "text-primary" : ""}`}>
              <Heart className={`h-4 w-4 ${post.liked_by_me ? "fill-current" : ""}`} /> {post.like_count}
            </button>
            <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1 text-xs">
              <MessageCircle className="h-4 w-4" /> {post.comment_count}
            </button>
          </div>
          {showComments && <Comments postId={post.id} canInteract={canInteract} />}
        </div>
        {canDelete && (
          <button onClick={onDelete} aria-label="Delete post" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </Card>
  );
}

function Comments({ postId, canInteract }: { postId: string; canInteract: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(getComments);
  const add = useServerFn(addComment);
  const [text, setText] = useState("");
  const q = useQuery({ queryKey: ["comments", postId], queryFn: () => list({ data: { postId } }) });
  const addMut = useMutation({
    mutationFn: () => add({ data: { postId, body: text.trim() } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["comments", postId] }); qc.invalidateQueries({ queryKey: ["community-feed"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const comments = q.data ?? [];
  return (
    <div className="mt-3 space-y-2 border-t pt-2">
      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <Avatar className="h-6 w-6">
            {c.author_avatar ? <AvatarImage src={c.author_avatar} alt={c.author_username} /> : null}
            <AvatarFallback className="text-[9px]">{c.author_username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="rounded-lg bg-muted/50 px-2 py-1">
            <span className="text-xs font-semibold">{c.author_username}</span>
            <span className="ml-1 text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
            <p className="text-xs">{c.body}</p>
          </div>
        </div>
      ))}
      {canInteract && (
        <div className="flex items-center gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={2000}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) addMut.mutate(); }} className="h-8 text-sm" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => addMut.mutate()} disabled={!text.trim() || addMut.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
