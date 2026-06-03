// PullBid Live — Communities (Priority 4).
// Official per-category communities with membership, a feed, likes and comments.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Public: list all communities. Annotated with whether the (optional) caller is a member.
export const listCommunities = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("communities")
    .select("id, slug, name, category, description, emoji, cover_url, member_count, post_count")
    .order("member_count", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

// Authenticated variant: which communities the current user has joined.
export const listMyCommunityIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("community_members")
      .select("community_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.community_id as string);
  });

export const getCommunity = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: community, error } = await supabaseAdmin
      .from("communities")
      .select("id, slug, name, category, description, emoji, cover_url, member_count, post_count")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!community) throw new Error("Community not found");
    return community;
  });

// Public feed for a community, newest first, with author + like state.
export const getCommunityFeed = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ communityId: z.string().uuid(), viewerId: z.string().uuid().nullish() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: posts, error } = await supabaseAdmin
      .from("community_posts")
      .select("id, user_id, body, image_url, like_count, comment_count, created_at")
      .eq("community_id", data.communityId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = posts ?? [];
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((p) => p.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", userIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    let liked = new Set<string>();
    if (data.viewerId) {
      const { data: likes } = await supabaseAdmin
        .from("community_post_likes")
        .select("post_id")
        .eq("user_id", data.viewerId)
        .in("post_id", rows.map((p) => p.id));
      liked = new Set((likes ?? []).map((l) => l.post_id as string));
    }

    return rows.map((p) => ({
      ...p,
      author_username: pmap.get(p.user_id)?.username ?? "Collector",
      author_avatar: pmap.get(p.user_id)?.avatar_url ?? null,
      liked_by_me: liked.has(p.id),
    }));
  });

export const joinCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ communityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_members")
      .insert({ community_id: data.communityId, user_id: userId });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const leaveCommunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ communityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_members")
      .delete()
      .eq("community_id", data.communityId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      communityId: z.string().uuid(),
      body: z.string().min(1).max(4000),
      image_url: z.string().max(2000).nullish(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("community_posts")
      .insert({ community_id: data.communityId, user_id: userId, body: data.body, image_url: data.image_url ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("community_posts")
      .delete()
      .eq("id", data.postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ postId: z.string().uuid(), like: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.like) {
      const { error } = await supabase
        .from("community_post_likes")
        .insert({ post_id: data.postId, user_id: userId });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("community_post_likes")
        .delete()
        .eq("post_id", data.postId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getComments = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: comments, error } = await supabaseAdmin
      .from("community_comments")
      .select("id, user_id, body, created_at")
      .eq("post_id", data.postId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = comments ?? [];
    if (rows.length === 0) return [];
    const userIds = [...new Set(rows.map((c) => c.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", userIds);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((c) => ({
      ...c,
      author_username: pmap.get(c.user_id)?.username ?? "Collector",
      author_avatar: pmap.get(c.user_id)?.avatar_url ?? null,
    }));
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ postId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("community_comments")
      .insert({ post_id: data.postId, user_id: userId, body: data.body })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
