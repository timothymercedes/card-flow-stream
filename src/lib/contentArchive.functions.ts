import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ArchiveItem = { id: string; kind: "story" | "post"; caption: string | null; created_at: string; media_url: string | null; is_video: boolean; label: string };

const storyPath = (u: string) => u.split("/stories/").pop()?.split("?")[0] || "";
const isVideo = (u?: string | null) => !!u && /\.(mp4|webm|mov)(\?|$)/i.test(u);

// Owner-only archive. Always scoped to the verified caller; RLS also limits rows to the owner
// and hides owner-deleted items (those stay with moderators in the admin review screen).
export const loadMyContentArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const nowIso = new Date().toISOString();
    const [stories, posts] = await Promise.all([
      supabase.from("stories").select("id,image_url,caption,created_at,expires_at").eq("user_id", userId).is("deleted_at", null).lte("expires_at", nowIso).order("created_at", { ascending: false }).limit(300),
      supabase.from("posts").select("id,image_url,caption,created_at,visibility").eq("user_id", userId).is("deleted_at", null).in("visibility", ["private", "only_me", "archived"]).order("created_at", { ascending: false }).limit(300),
    ]);
    const paths = (stories.data || []).map((s: any) => storyPath(s.image_url)).filter(Boolean);
    const { data: signed } = paths.length ? await supabase.storage.from("stories").createSignedUrls(paths, 600) : { data: [] };
    const byPath = new Map((signed || []).map((x: any) => [x.path, x.signedUrl]));
    const items: ArchiveItem[] = [
      ...(stories.data || []).map((s: any) => ({ id: s.id, kind: "story" as const, caption: s.caption, created_at: s.created_at, media_url: (byPath.get(storyPath(s.image_url)) as string) || null, is_video: isVideo(s.image_url), label: "Expired Story" })),
      ...(posts.data || []).map((p: any) => ({ id: p.id, kind: "post" as const, caption: p.caption, created_at: p.created_at, media_url: p.image_url || null, is_video: isVideo(p.image_url), label: "Archived post" })),
    ];
    return { items };
  });
