// Stage 1 demonstration fixtures. Never reads or writes customer data.
export type DemoAudience = 'public' | 'followers' | 'friends' | 'only_me';
export type DemoViewer = 'owner' | 'guest' | 'unrelated' | 'follower' | 'friend';
export const DEMO_VIEWERS: { id: DemoViewer; label: string }[] = [
  { id: 'owner', label: 'Owner' }, { id: 'guest', label: 'Signed-out guest' }, { id: 'unrelated', label: 'Unrelated member' },
  { id: 'follower', label: 'Follower' }, { id: 'friend', label: 'Close friend' },
];
export const AUDIENCE_LABEL: Record<DemoAudience, string> = { public: 'Public', followers: 'Followers', friends: 'Close friends', only_me: 'Only me' };
export function demoCanSee(viewer: DemoViewer, audience: DemoAudience) {
  if (viewer === 'owner') return true;
  if (audience === 'public') return true;
  if (audience === 'followers') return viewer === 'follower' || viewer === 'friend';
  if (audience === 'friends') return viewer === 'friend';
  return false;
}
export type DemoPhoto = 'collectibles' | 'gaming' | 'outdoors' | 'detail' | 'music';
export type DemoPost = { id: string; caption: string; photos: DemoPhoto[]; audience: DemoAudience; date: string; appreciations: number; comments: number; kind: 'story' | 'collectible' | 'video' };
export type DemoCard = { id: string; name: string; set: string; audience: DemoAudience; photo: DemoPhoto };
export const DEMO_PROFILE = { name: 'Avery Demo', username: 'avery.demo', bio: 'Weekend card hunter, trail runner and vintage arcade fan. Telling the stories behind every pull.', location: 'Demo City', followers: 1284, following: 312 };
export const DEMO_POSTS: DemoPost[] = [
  { id: 'p1', kind: 'story', caption: 'Spent Saturday at the regional card show. The best part was meeting people who have collected for 30 years.', photos: ['collectibles', 'detail'], audience: 'public', date: '2026-11-12', appreciations: 48, comments: 9 },
  { id: 'p2', kind: 'collectible', caption: 'Finally completed the set I started as a kid.', photos: ['detail'], audience: 'followers', date: '2026-11-10', appreciations: 31, comments: 4 },
  { id: 'p3', kind: 'story', caption: 'Sunrise trail run before the live show. Clearing my head.', photos: ['outdoors'], audience: 'friends', date: '2026-11-08', appreciations: 12, comments: 2 },
  { id: 'p4', kind: 'story', caption: 'Private note: budget for next month’s show.', photos: [], audience: 'only_me', date: '2026-11-06', appreciations: 0, comments: 0 },
  { id: 'p5', kind: 'video', caption: 'Arcade night — beat my old high score.', photos: ['gaming'], audience: 'public', date: '2026-11-03', appreciations: 22, comments: 5 },
  { id: 'p6', kind: 'story', caption: 'Listening session while sorting the binder.', photos: ['music'], audience: 'public', date: '2026-10-30', appreciations: 17, comments: 1 },
];
export const DEMO_CARDS: DemoCard[] = [
  { id: 'c1', name: 'Demo Rookie Star', set: 'Demo Series 1', audience: 'public', photo: 'detail' },
  { id: 'c2', name: 'Demo Holo Dragon', set: 'Demo Legends', audience: 'public', photo: 'collectibles' },
  { id: 'c3', name: 'Demo Gold Parallel', set: 'Demo Chrome', audience: 'followers', photo: 'detail' },
  { id: 'c4', name: 'Demo First Edition', set: 'Demo Base', audience: 'friends', photo: 'collectibles' },
  { id: 'c5', name: 'Demo Grail (private)', set: 'Demo Vault', audience: 'only_me', photo: 'detail' },
];
export function visiblePosts(viewer: DemoViewer, posts = DEMO_POSTS) { return posts.filter(p => demoCanSee(viewer, p.audience)); }
/** Showcase never includes private cards, even for the owner — only explicitly shared cards appear. */
export function showcaseCards(viewer: DemoViewer, cards = DEMO_CARDS) { return cards.filter(c => c.audience !== 'only_me' && demoCanSee(viewer, c.audience)).slice(0, 9); }
