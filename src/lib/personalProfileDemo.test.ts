import { describe, expect, it } from 'vitest';
import { DEMO_POSTS, demoCanSee, visiblePosts, showcaseCards, editDemoPost, demoCanInteract, demoCanRepost } from './personalProfileDemo';
describe('Stage 1 simulated audiences', () => {
  it('guest and unrelated members see only public', () => {
    for (const v of ['guest', 'unrelated'] as const) { expect(demoCanSee(v, 'public')).toBe(true); expect(demoCanSee(v, 'followers')).toBe(false); expect(demoCanSee(v, 'friends')).toBe(false); expect(demoCanSee(v, 'only_me')).toBe(false); }
  });
  it('followers see public and followers', () => { expect(demoCanSee('follower', 'followers')).toBe(true); expect(demoCanSee('follower', 'friends')).toBe(false); });
  it('close friends see friends but never only-me', () => { expect(demoCanSee('friend', 'friends')).toBe(true); expect(demoCanSee('friend', 'only_me')).toBe(false); });
  it('only-me posts never reach any visitor', () => { for (const v of ['guest', 'unrelated', 'follower', 'friend'] as const) expect(visiblePosts(v).some(p => p.audience === 'only_me')).toBe(false); });
  it('private cards never appear in Showcase, even for owner', () => { for (const v of ['owner', 'guest', 'follower', 'friend'] as const) expect(showcaseCards(v).some(c => c.audience === 'only_me')).toBe(false); });
  it('editing changes the same post without losing its media or collectible', () => {
    const edited = editDemoPost(DEMO_POSTS, 'p2', 'Updated caption', 'only_me');
    expect(edited).toHaveLength(6);
    expect(edited.find(p => p.id === 'p2')).toEqual({ ...DEMO_POSTS[1], caption: 'Updated caption', audience: 'only_me' });
    expect(visiblePosts('follower', edited).map(p => p.id)).not.toContain('p2');
    expect(DEMO_POSTS[1].audience).toBe('followers');
  });
  it('guests cannot comment or react and members cannot interact with inaccessible posts', () => {
    expect(demoCanInteract('guest', DEMO_POSTS[0])).toBe(false);
    expect(demoCanInteract('unrelated', DEMO_POSTS[1])).toBe(false);
    expect(demoCanInteract('follower', DEMO_POSTS[1])).toBe(true);
  });
  it('shared posts cannot widen a private audience', () => {
    expect(demoCanRepost('owner', DEMO_POSTS[1])).toBe(false);
    expect(demoCanRepost('guest', DEMO_POSTS[0])).toBe(false);
    expect(demoCanRepost('follower', DEMO_POSTS[0])).toBe(true);
  });
});
