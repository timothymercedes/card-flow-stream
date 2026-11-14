import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveViewerTier, allowedAudiences, projectForTier, canSeeIdentity, pageBounds, PUBLIC_MEDIA_SLOTS, canSee, type ViewerTier } from './personalProfileAudience';

import { visitorGateDecision, RELEASE_ENV } from './personalProfileRelease';
/** Server-only gate: default OFF; when ON every request still passes the full audience checks. */
export function assertIsolatedPersonalProfile(request: Request) {
  const d = visitorGateDecision({ releaseFlag: process.env[RELEASE_ENV], backendUrl: process.env['SUPABASE_URL'], requestUrl: request.url });
  if (!d.allowed) throw new Error(d.reason);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any>;
export async function admin(): Promise<Admin> { return (await import('@/integrations/supabase/client.server')).supabaseAdmin as unknown as Admin; }

/** Verifies the bearer token with the auth server; absent/invalid → guest. */
export async function optionalViewer(db: Admin, request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token.startsWith('sb_')) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}
async function relationship(db: Admin, viewerId: string | null, ownerId: string): Promise<ViewerTier> {
  if (viewerId === ownerId) return 'owner';
  if (!viewerId) return resolveViewerTier({ viewerId, ownerId, blockedEitherWay: false, follows: false, closeFriend: false });
  const [blocks, follow, friend] = await Promise.all([
    db.from('user_blocks').select('blocker_id').or(`and(blocker_id.eq.${ownerId},blocked_id.eq.${viewerId}),and(blocker_id.eq.${viewerId},blocked_id.eq.${ownerId})`).limit(1),
    db.from('follows').select('follower_id').eq('follower_id', viewerId).eq('followee_id', ownerId).limit(1),
    db.from('story_close_friends').select('friend_id').eq('owner_id', ownerId).eq('friend_id', viewerId).limit(1),
  ]);
  // Any failed relationship read fails closed.
  if (blocks.error || follow.error || friend.error) return 'blocked';
  return resolveViewerTier({ viewerId, ownerId, blockedEitherWay: (blocks.data ?? []).length > 0, follows: (follow.data ?? []).length > 0, closeFriend: (friend.data ?? []).length > 0 });
}
async function findOwner(db: Admin, username: string) {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!/^[a-z0-9_.-]{1,40}$/i.test(username) || uuid.test(username)) return null;
  const direct = await db.from('personal_social_identities').select('user_id,username,display_name,bio,audience').eq('username', username.toLowerCase()).maybeSingle();
  if (direct.data) return direct.data;
  // Platform usernames (feeds, comments, search) map to the same person's social identity.
  const profile = await db.from('profiles').select('id').ilike('username', username).maybeSingle();
  if (!profile.data) return null;
  return (await db.from('personal_social_identities').select('user_id,username,display_name,bio,audience').eq('user_id', profile.data.id).maybeSingle()).data ?? null;
}
const UNAVAILABLE = { unavailable: true as const, tier: null, identity: null, posts: [], media: [], comments: [], reactions: [], cards: [], nextCursor: null as number | null };

export async function loadVisitorProfile(db: Admin, viewerId: string | null, username: string, cursor?: number) {
  const identity = await findOwner(db, username);
  if (!identity) return UNAVAILABLE;
  const tier = await relationship(db, viewerId, identity.user_id);
  if (tier === 'blocked' || !canSeeIdentity(tier, identity.audience)) return UNAVAILABLE;
  const audiences = allowedAudiences(tier);
  const { from, to } = pageBounds(cursor);
  // The query itself filters by audience; projectForTier re-checks every row.
  const postsRes = await db.from('personal_social_posts').select('id,caption,audience,allow_comments,pinned,collectible_id,created_at').eq('user_id', identity.user_id).in('audience', audiences).order('created_at', { ascending: false }).range(from, to);
  if (postsRes.error) throw new Error('Profile unavailable.');
  const posts = postsRes.data ?? [];
  const ids = posts.map(p => p.id);
  const [mediaRes, commentsRes, reactionsRes] = await Promise.all([
    db.from('personal_social_media').select('id,post_id,kind,slot,created_at').eq('user_id', identity.user_id).or(ids.length ? `post_id.in.(${ids.join(',')}),slot.in.(${PUBLIC_MEDIA_SLOTS.join(',')})` : `slot.in.(${PUBLIC_MEDIA_SLOTS.join(',')})`).limit(500),
    ids.length ? db.from('personal_social_comments').select('id,post_id,content,created_at').in('post_id', ids).order('created_at').limit(500) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('personal_social_reactions').select('post_id,user_id').in('post_id', ids).limit(2000) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mediaRes.error || commentsRes.error || reactionsRes.error) throw new Error('Profile unavailable.');
  const projected = projectForTier(tier, identity.audience, { posts, media: mediaRes.data ?? [], comments: commentsRes.data ?? [], reactions: reactionsRes.data ?? [] });
  // Collectibles: names only, only for cards the owner made public. Never images.
  const cardIds = [...new Set(projected.posts.map(p => p.collectible_id).filter((v): v is string => !!v))];
  const cardsRes = cardIds.length ? await db.from('vault_cards').select('id,name,visibility').in('id', cardIds).eq('user_id', identity.user_id) : { data: [], error: null };
  const cards = (cardsRes.data ?? []).filter(c => c.visibility === 'public').map(c => ({ id: c.id, name: c.name }));
  return {
    unavailable: false as const, tier,
    identity: { username: identity.username, display_name: identity.display_name, bio: identity.bio },
    // Explicit allow-listed fields only, whatever the query returned.
    posts: projected.posts.map(p => ({ id: p.id, caption: p.caption, audience: p.audience, allow_comments: p.allow_comments, pinned: p.pinned, collectible_id: p.collectible_id, created_at: p.created_at })),
    media: projected.media.map(m => ({ id: m.id, post_id: m.post_id, kind: m.kind, slot: m.slot })),
    comments: projected.comments.map(c => ({ id: c.id, post_id: c.post_id, content: c.content, created_at: c.created_at })),
    // Viewers learn counts and their own reaction, not who reacted.
    reactions: projected.reactions.map(r => ({ post_id: r.post_id, mine: !!viewerId && r.user_id === viewerId })),
    cards, nextCursor: posts.length > to - from ? to + 1 : null,
  };
}

/** Independent per-request media authorization: re-reads relationship facts. */
export async function authorizeMedia(db: Admin, viewerId: string | null, mediaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return null;
  const m = await db.from('personal_social_media').select('id,user_id,post_id,slot,kind,object_path').eq('id', mediaId).maybeSingle();
  if (!m.data) return null;
  const ident = await db.from('personal_social_identities').select('audience').eq('user_id', m.data.user_id).maybeSingle();
  if (!ident.data) return null;
  const tier = await relationship(db, viewerId, m.data.user_id);
  if (tier === 'blocked' || !canSeeIdentity(tier, ident.data.audience)) return null;
  if (!m.data.post_id) return (PUBLIC_MEDIA_SLOTS as readonly string[]).includes(m.data.slot) ? m.data : null;
  const post = await db.from('personal_social_posts').select('audience,user_id').eq('id', m.data.post_id).maybeSingle();
  if (!post.data || post.data.user_id !== m.data.user_id || m.data.slot !== 'post' || !canSee(tier, post.data.audience)) return null;
  return m.data;
}

/** Visitor comment/reaction writes: authorized here, written with the server client. */
export async function visitorInteract(db: Admin, viewerId: string, postId: string, action: { kind: 'react'; value: boolean } | { kind: 'comment'; content: string }) {
  const post = await db.from('personal_social_posts').select('id,user_id,audience,allow_comments').eq('id', postId).maybeSingle();
  if (!post.data) throw new Error('Story unavailable.');
  const ident = await db.from('personal_social_identities').select('audience').eq('user_id', post.data.user_id).maybeSingle();
  const tier = await relationship(db, viewerId, post.data.user_id);
  const { canInteract } = await import('./personalProfileAudience');
  if (!ident.data || !canSeeIdentity(tier, ident.data.audience) || !canInteract(tier, post.data, action.kind)) throw new Error('Story unavailable.');
  if (action.kind === 'react') {
    const r = action.value ? await db.from('personal_social_reactions').upsert({ post_id: postId, user_id: viewerId }) : await db.from('personal_social_reactions').delete().eq('post_id', postId).eq('user_id', viewerId);
    if (r.error) throw new Error('Unable to save.');
  } else {
    const r = await db.from('personal_social_comments').insert({ post_id: postId, user_id: viewerId, content: action.content });
    if (r.error) throw new Error('Unable to save.');
  }
  return { ok: true };
}
