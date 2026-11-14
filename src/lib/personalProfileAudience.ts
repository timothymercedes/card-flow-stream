/** Pure visitor authorization for the Personal Profile. Server code feeds it
 * relationship facts it read itself; the browser never decides access. */
export type Audience = 'public' | 'followers' | 'friends' | 'only_me';
export type ViewerTier = 'owner' | 'friend' | 'follower' | 'member' | 'guest' | 'blocked';
export const PUBLIC_MEDIA_SLOTS = ['avatar', 'cover0', 'cover1', 'cover2'] as const;
export const VISITOR_PAGE_SIZE = 20;

export function resolveViewerTier(f: { viewerId: string | null; ownerId: string; blockedEitherWay: boolean; follows: boolean; closeFriend: boolean }): ViewerTier {
  if (f.viewerId && f.viewerId === f.ownerId) return 'owner';
  if (f.blockedEitherWay) return 'blocked';
  if (!f.viewerId) return 'guest';
  // Close friends must also still follow: removing the follow revokes both tiers.
  if (f.closeFriend && f.follows) return 'friend';
  if (f.follows) return 'follower';
  return 'member';
}
export function allowedAudiences(tier: ViewerTier): Audience[] {
  switch (tier) {
    case 'owner': return ['public', 'followers', 'friends', 'only_me'];
    case 'friend': return ['public', 'followers', 'friends'];
    case 'follower': return ['public', 'followers'];
    case 'member': case 'guest': return ['public'];
    default: return [];
  }
}
export function canSee(tier: ViewerTier, audience: string) { return (allowedAudiences(tier) as string[]).includes(audience); }
/** Profile header (name/bio/avatar/cover) visibility follows the identity audience. */
export function canSeeIdentity(tier: ViewerTier, identityAudience: string) { return canSee(tier, identityAudience); }
export function canInteract(tier: ViewerTier, post: { audience: string; allow_comments?: boolean }, kind: 'comment' | 'react') {
  if (tier === 'guest' || tier === 'blocked') return false;
  if (!canSee(tier, post.audience)) return false;
  return kind === 'react' || post.allow_comments !== false;
}

type Post = { id: string; audience: string; collectible_id: string | null; [k: string]: unknown };
type Media = { id: string; post_id: string | null; slot: string; [k: string]: unknown };
type Child = { post_id: string; [k: string]: unknown };
/** Strips everything a tier may not see. Media is exposed only via a public
 * slot (when the identity is visible) or an authorized parent post. */
export function projectForTier<P extends Post, M extends Media, C extends Child, R extends Child>(tier: ViewerTier, identityAudience: string, raw: { posts: P[]; media: M[]; comments: C[]; reactions: R[] }) {
  if (tier === 'blocked' || !canSeeIdentity(tier, identityAudience)) return { posts: [] as P[], media: [] as M[], comments: [] as C[], reactions: [] as R[] };
  const posts = raw.posts.filter(p => canSee(tier, p.audience));
  const ids = new Set(posts.map(p => p.id));
  const media = raw.media.filter(m => m.post_id ? ids.has(m.post_id) && m.slot === 'post' : (PUBLIC_MEDIA_SLOTS as readonly string[]).includes(m.slot));
  return { posts, media, comments: raw.comments.filter(c => ids.has(c.post_id)), reactions: raw.reactions.filter(r => ids.has(r.post_id)) };
}
export function pageBounds(cursor: number | undefined) { const from = Math.max(0, Math.floor(cursor ?? 0)); return { from, to: from + VISITOR_PAGE_SIZE - 1 }; }
