import { supabase } from "@/integrations/supabase/client";

export type StoryOverlay = { kind: "text" | "sticker"; value: string; x: number; y: number };
export type Story = {
  id: string; user_id: string; username: string; avatar_url: string | null; image_url: string;
  caption: string | null; visibility: string; created_at: string; expires_at: string;
  media_type: string; sequence_id: string | null; overlays: StoryOverlay[];
};

export const STORY_REACTIONS = [
  { key: "love", emoji: "❤️" }, { key: "fire", emoji: "🔥" }, { key: "eyes", emoji: "👀" },
  { key: "laugh", emoji: "😂" }, { key: "wow", emoji: "😮" }, { key: "money", emoji: "💯" },
] as const;
export const STORY_STICKERS = ["🔥", "💎", "🃏", "⚡", "🏆", "❤️", "😍", "🎉", "👑", "✨", "💯", "📦"];
export const MAX_STORY_ITEMS = 10;
export const IMAGE_SECONDS = 5;
export const MAX_VIDEO_SECONDS = 60;

export function storyPath(url: string) {
  return url.split("/stories/").pop()?.split("?")[0] || "";
}

/** Sign private story media; rows the viewer can't open are dropped. */
export async function signStories(rows: any[]): Promise<Story[]> {
  const norm: Story[] = rows.map((r) => ({ ...r, overlays: Array.isArray(r.overlays) ? r.overlays : [], media_type: r.media_type || "image" }));
  const paths = norm.map((r) => storyPath(r.image_url)).filter(Boolean);
  if (!paths.length) return [];
  const { data } = await supabase.storage.from("stories").createSignedUrls(paths, 600);
  const by = new Map((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  return norm.filter((r) => by.has(storyPath(r.image_url))).map((r) => ({ ...r, image_url: by.get(storyPath(r.image_url))! }));
}

/** Group by creator, oldest first inside a group; groups with unseen stories come first. */
export function groupStories(stories: Story[], seen: Set<string>, me?: string) {
  const map = new Map<string, Story[]>();
  for (const s of [...stories].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    if (!map.has(s.user_id)) map.set(s.user_id, []);
    map.get(s.user_id)!.push(s);
  }
  const groups = [...map.values()].map((g) => ({ stories: g, unread: g.some((s) => !seen.has(s.id)) }));
  return groups.sort((a, b) => {
    const am = a.stories[0]!.user_id === me ? 0 : 1, bm = b.stories[0]!.user_id === me ? 0 : 1;
    if (am !== bm) return am - bm;
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return +new Date(b.stories.at(-1)!.created_at) - +new Date(a.stories.at(-1)!.created_at);
  });
}

export function firstUnreadIndex(group: Story[], seen: Set<string>) {
  const i = group.findIndex((s) => !seen.has(s.id));
  return i === -1 ? 0 : i;
}

export function isStoryActive(s: Pick<Story, "expires_at">, now = Date.now()) {
  return +new Date(s.expires_at) > now;
}

export async function loadSeen(userId: string | undefined, ids: string[]) {
  if (!userId || !ids.length) return new Set<string>();
  const { data } = await supabase.from("story_views").select("story_id").eq("viewer_id", userId).in("story_id", ids);
  return new Set((data || []).map((r: any) => r.story_id as string));
}
