import { describe, it, expect } from 'vitest';
import { resolveViewerTier, allowedAudiences, canInteract, projectForTier } from './personalProfileAudience';
import { loadVisitorProfile, authorizeMedia, visitorInteract } from './personalProfileVisitor.server';

const O = 'aaaaaaaa-0000-4000-8000-000000000001', F = 'aaaaaaaa-0000-4000-8000-000000000002', C = 'aaaaaaaa-0000-4000-8000-000000000003', U = 'aaaaaaaa-0000-4000-8000-000000000004', B = 'aaaaaaaa-0000-4000-8000-000000000005', B2 = 'aaaaaaaa-0000-4000-8000-000000000006';
const pid = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  const from = (t: string) => {
    let rows = [...(tables[t] ?? [])]; let range: [number, number] | null = null; let lim = Infinity;
    const b: Record<string, unknown> = {
      select: () => b, order: (k: string, o?: { ascending?: boolean }) => { rows.sort((x, y) => String(x[k]).localeCompare(String(y[k])) * (o?.ascending === false ? -1 : 1)); return b; },
      eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return b; },
      ilike: (k: string, v: string) => { rows = rows.filter(r => String(r[k]).toLowerCase() === v.toLowerCase()); return b; },
      in: (k: string, v: unknown[]) => { rows = rows.filter(r => v.includes(r[k])); return b; },
      or: (expr: string) => {
        const pairs = [...expr.matchAll(/and\(blocker_id\.eq\.([^,]+),blocked_id\.eq\.([^)]+)\)/g)];
        if (pairs.length) { rows = rows.filter(r => pairs.some(p => r.blocker_id === p[1] && r.blocked_id === p[2])); return b; }
        const posts = /post_id\.in\.\(([^)]*)\)/.exec(expr)?.[1]?.split(',') ?? []; const slots = /slot\.in\.\(([^)]*)\)/.exec(expr)?.[1]?.split(',') ?? [];
        rows = rows.filter(r => posts.includes(String(r.post_id)) || slots.includes(String(r.slot))); return b;
      },
      limit: (n: number) => { lim = n; return b; }, range: (a: number, z: number) => { range = [a, z]; return b; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      upsert: async (r: Row) => { writes.push(`${t}:upsert`); tables[t] = [...(tables[t] ?? []), r]; return { error: null }; },
      insert: async (r: Row) => { writes.push(`${t}:insert`); tables[t] = [...(tables[t] ?? []), r]; return { error: null }; },
      delete: () => b,
      then: (res: (v: unknown) => void) => res({ data: (range ? rows.slice(range[0], range[1] + 1) : rows).slice(0, lim), error: null }),
    };
    return b;
  };
  return { db: { from } as never, writes };
}
function world() {
  const posts = [
    { id: pid(1), user_id: O, audience: 'public', caption: 'pub', allow_comments: true, pinned: false, collectible_id: 'cccccccc-0000-4000-8000-000000000001', created_at: '2026-01-04' },
    { id: pid(2), user_id: O, audience: 'followers', caption: 'fol', allow_comments: true, pinned: false, collectible_id: 'cccccccc-0000-4000-8000-000000000002', created_at: '2026-01-03' },
    { id: pid(3), user_id: O, audience: 'friends', caption: 'cf', allow_comments: true, pinned: false, collectible_id: null, created_at: '2026-01-02' },
    { id: pid(4), user_id: O, audience: 'only_me', caption: 'me', allow_comments: true, pinned: false, collectible_id: null, created_at: '2026-01-01' },
  ];
  return {
    personal_social_identities: [{ user_id: O, username: 'owner.one', display_name: 'Owner', bio: 'bio', audience: 'public' }],
    profiles: [{ id: O, username: 'OwnerShop', email: 'secret@example.com', phone: '555' }],
    personal_social_posts: posts,
    personal_social_media: [
      { id: 'dddddddd-0000-4000-8000-000000000001', user_id: O, post_id: null, slot: 'avatar', kind: 'image', object_path: `${O}/a.jpg` },
      ...posts.map((p, i) => ({ id: `dddddddd-0000-4000-8000-00000000001${i}`, user_id: O, post_id: p.id, slot: 'post', kind: i === 1 ? 'video' : 'image', object_path: `${O}/${i}.jpg` })),
    ],
    personal_social_comments: posts.map((p, i) => ({ id: `eeeeeeee-0000-4000-8000-00000000000${i}`, post_id: p.id, user_id: O, content: `c-${p.audience}` })),
    personal_social_reactions: posts.map(p => ({ post_id: p.id, user_id: F })),
    follows: [{ follower_id: F, followee_id: O }, { follower_id: C, followee_id: O }, { follower_id: B, followee_id: O }],
    story_close_friends: [{ owner_id: O, friend_id: C }],
    user_blocks: [{ blocker_id: O, blocked_id: B }, { blocker_id: B2, blocked_id: O }],
    vault_cards: [{ id: 'cccccccc-0000-4000-8000-000000000001', user_id: O, name: 'Public Card', visibility: 'public', image_url: 'https://x/vault.jpg' }, { id: 'cccccccc-0000-4000-8000-000000000002', user_id: O, name: 'Private Card', visibility: 'private', image_url: 'https://x/p.jpg' }],
  } as Record<string, Row[]>;
}
const audiencesOf = (r: { posts: { audience: string }[] }) => r.posts.map(p => p.audience).sort();

describe('tier rules', () => {
  it('six roles map to the right audiences', () => {
    expect(allowedAudiences('owner')).toEqual(['public', 'followers', 'friends', 'only_me']);
    expect(allowedAudiences('friend')).toEqual(['public', 'followers', 'friends']);
    expect(allowedAudiences('follower')).toEqual(['public', 'followers']);
    expect(allowedAudiences('member')).toEqual(['public']);
    expect(allowedAudiences('guest')).toEqual(['public']);
    expect(allowedAudiences('blocked')).toEqual([]);
  });
  it('block wins over follow and close friend', () => expect(resolveViewerTier({ viewerId: B, ownerId: O, blockedEitherWay: true, follows: true, closeFriend: true })).toBe('blocked'));
  it('close friend without follow is only a member (revocation)', () => expect(resolveViewerTier({ viewerId: C, ownerId: O, blockedEitherWay: false, follows: false, closeFriend: true })).toBe('member'));
  it('guests cannot react or comment, even on public', () => { expect(canInteract('guest', { audience: 'public' }, 'react')).toBe(false); expect(canInteract('follower', { audience: 'friends' }, 'comment')).toBe(false); expect(canInteract('member', { audience: 'public', allow_comments: false }, 'comment')).toBe(false); });
  it('media outside public slots or authorized posts is dropped', () => {
    const r = projectForTier('guest', 'public', { posts: [{ id: 'p', audience: 'public', collectible_id: null }, { id: 'q', audience: 'only_me', collectible_id: null }], media: [{ id: '1', post_id: null, slot: 'avatar' }, { id: '2', post_id: null, slot: 'vault' }, { id: '3', post_id: 'q', slot: 'post' }, { id: '4', post_id: 'p', slot: 'post' }], comments: [], reactions: [] });
    expect(r.media.map(m => m.id)).toEqual(['1', '4']);
  });
});

describe('server projection matrix', () => {
  const cases: [string, string | null, string[]][] = [
    ['owner', O, ['followers', 'friends', 'only_me', 'public']], ['close friend', C, ['followers', 'friends', 'public']],
    ['follower', F, ['followers', 'public']], ['unrelated', U, ['public']], ['guest', null, ['public']],
  ];
  for (const [name, viewer, expected] of cases) it(`${name} sees exactly ${expected.join(',')}`, async () => {
    const r = await loadVisitorProfile(fakeDb(world()).db, viewer, 'owner.one');
    expect(r.unavailable).toBe(false); expect(audiencesOf(r)).toEqual(expected);
    const ids = new Set(r.posts.map(p => p.id));
    expect(r.comments.every(c => ids.has(c.post_id))).toBe(true);
    expect(r.reactions.every(x => ids.has(x.post_id))).toBe(true);
    expect(r.media.every(m => (m.post_id ? ids.has(m.post_id) : m.slot === 'avatar'))).toBe(true);
  });
  it('blocked by owner and blocking the owner are both denied', async () => {
    for (const v of [B, B2]) expect((await loadVisitorProfile(fakeDb(world()).db, v, 'owner.one')).unavailable).toBe(true);
  });
  it('never returns private account fields, storage paths or Vault images', async () => {
    const json = JSON.stringify(await loadVisitorProfile(fakeDb(world()).db, O, 'owner.one'));
    for (const leak of ['secret@example.com', '555', 'object_path', 'vault.jpg', 'Private Card', 'user_id']) expect(json).not.toContain(leak);
    expect(json).toContain('Public Card');
  });
  it('platform username resolves to the same personal profile', async () => expect((await loadVisitorProfile(fakeDb(world()).db, null, 'ownershop')).identity?.username).toBe('owner.one'));
  it('owner-hidden identity hides everything from visitors', async () => { const w = world(); w.personal_social_identities![0]!.audience = 'only_me'; expect((await loadVisitorProfile(fakeDb(w).db, F, 'owner.one')).unavailable).toBe(true); });
  it('revoked follow immediately loses followers content', async () => { const w = world(); w.follows = w.follows!.filter(f => f.follower_id !== F); expect(audiencesOf(await loadVisitorProfile(fakeDb(w).db, F, 'owner.one'))).toEqual(['public']); });
  it('removed close friend drops to follower', async () => { const w = world(); w.story_close_friends = []; expect(audiencesOf(await loadVisitorProfile(fakeDb(w).db, C, 'owner.one'))).toEqual(['followers', 'public']); });
  it('paginates 20 at a time without leaking hidden rows', async () => {
    const w = world(); for (let i = 10; i < 55; i++) w.personal_social_posts!.push({ id: pid(i), user_id: O, audience: i % 2 ? 'public' : 'only_me', caption: 'x', allow_comments: true, pinned: false, collectible_id: null, created_at: `2025-12-${String(i % 28 + 1).padStart(2, '0')}` });
    const p1 = await loadVisitorProfile(fakeDb(w).db, null, 'owner.one');
    expect(p1.posts.length).toBe(20); expect(p1.nextCursor).toBe(20);
    const p2 = await loadVisitorProfile(fakeDb(w).db, null, 'owner.one', 20);
    expect([...p1.posts, ...p2.posts].every(p => p.audience === 'public')).toBe(true);
  });
});

describe('direct media and interactions', () => {
  const media = (i: number) => `dddddddd-0000-4000-8000-00000000001${i}`;
  it('direct media follows the parent story audience for every role', async () => {
    const expect_: [string | null, boolean[]][] = [[O, [true, true, true, true]], [C, [true, true, true, false]], [F, [true, true, false, false]], [U, [true, false, false, false]], [null, [true, false, false, false]], [B, [false, false, false, false]], [B2, [false, false, false, false]]];
    for (const [viewer, allowed] of expect_) for (let i = 0; i < 4; i++) expect(!!(await authorizeMedia(fakeDb(world()).db, viewer, media(i))), `${viewer} media ${i}`).toBe(allowed[i]);
  });
  it('public avatar slot is visible to guests but not to blocked users', async () => {
    expect(await authorizeMedia(fakeDb(world()).db, null, 'dddddddd-0000-4000-8000-000000000001')).not.toBeNull();
    expect(await authorizeMedia(fakeDb(world()).db, B, 'dddddddd-0000-4000-8000-000000000001')).toBeNull();
  });
  it('follower cannot comment on close-friends story; close friend can', async () => {
    await expect(visitorInteract(fakeDb(world()).db, F, pid(3), { kind: 'comment', content: 'hi' })).rejects.toThrow();
    const f = fakeDb(world()); await visitorInteract(f.db, C, pid(3), { kind: 'comment', content: 'hi' }); expect(f.writes).toEqual(['personal_social_comments:insert']);
  });
  it('blocked and unrelated users cannot react on followers story', async () => {
    for (const v of [B, B2, U]) await expect(visitorInteract(fakeDb(world()).db, v, pid(2), { kind: 'react', value: true })).rejects.toThrow();
  });
});
