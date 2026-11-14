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
export type DemoPhoto = 'showcase' | 'grading' | 'packs' | 'community';
export type DemoPost = { id: string; caption: string; photos: DemoPhoto[]; audience: DemoAudience; date: string; appreciations: number; comments: number; kind: 'story' | 'collectible' | 'video'; collectible?: { name: string; series: string; finish: string } };
export type DemoCard = { id: string; name: string; set: string; audience: DemoAudience; photo: DemoPhoto };
export const DEMO_PROFILE = { name: 'Avery Demo', username: 'avery.demo', bio: 'Trading-card collector, binder curator and weekend card-show regular. Here for the art, the pulls and the people.', location: 'Demo City', followers: 1284, following: 312 };
export const DEMO_POSTS: DemoPost[] = [
  { id: 'p1', kind: 'story', caption: 'A table full of binders, a few missing pieces, and a whole afternoon of collector stories. Our community trade night reminded me why I started collecting.', photos: ['community', 'grading'], audience: 'public', date: '2026-11-12', appreciations: 48, comments: 9 },
  { id: 'p2', kind: 'collectible', caption: 'The final piece in my fantasy foil trio. That emerald finish deserves a spot outside the binder — a little gallery for a long-awaited pull.', photos: ['showcase'], collectible: { name: 'Emerald Dragon', series: 'Demo Legends · Gallery trio', finish: 'Holographic foil' }, audience: 'followers', date: '2026-11-10', appreciations: 31, comments: 4 },
  { id: 'p3', kind: 'story', caption: 'Grading prep with the crew: checking corners, edges and centering before sleeving each card. Taking our time — the condition story matters too.', photos: ['grading'], audience: 'friends', date: '2026-11-08', appreciations: 12, comments: 2 },
  { id: 'p4', kind: 'story', caption: 'Private collecting journal: finish the rookie-card checklist before buying another box.', photos: [], audience: 'only_me', date: '2026-11-06', appreciations: 0, comments: 0 },
  { id: 'p5', kind: 'video', caption: 'Friday pack-opening highlights. The foil reveal, the pause, then everyone leaning in to see the artwork. That never gets old.', photos: ['packs'], audience: 'public', date: '2026-11-03', appreciations: 22, comments: 5 },
  { id: 'p6', kind: 'collectible', caption: 'Sports nostalgia meets fantasy art. Three different cards, three different stories — curated together for this week’s collector spotlight.', photos: ['showcase'], collectible: { name: 'The collector’s edit', series: 'Demo showcase · Sports & fantasy', finish: 'Slabbed display trio' }, audience: 'public', date: '2026-10-30', appreciations: 17, comments: 1 },
];
export const DEMO_CARDS: DemoCard[] = [
  { id: 'c1', name: 'Demo Gallery Trio', set: 'Demo Sports & Fantasy', audience: 'public', photo: 'showcase' },
  { id: 'c2', name: 'Demo Foil Pulls', set: 'Demo Legends', audience: 'public', photo: 'packs' },
  { id: 'c3', name: 'Demo Emerald Dragon', set: 'Demo Chrome', audience: 'followers', photo: 'grading' },
  { id: 'c4', name: 'Demo First Edition', set: 'Demo Base', audience: 'friends', photo: 'showcase' },
  { id: 'c5', name: 'Demo Grail (private)', set: 'Demo Vault', audience: 'only_me', photo: 'grading' },
];
export function visiblePosts(viewer: DemoViewer, posts = DEMO_POSTS) { return posts.filter(p => demoCanSee(viewer, p.audience)); }
/** Showcase never includes private cards, even for the owner — only explicitly shared cards appear. */
export function showcaseCards(viewer: DemoViewer, cards = DEMO_CARDS) { return cards.filter(c => c.audience !== 'only_me' && demoCanSee(viewer, c.audience)).slice(0, 9); }
