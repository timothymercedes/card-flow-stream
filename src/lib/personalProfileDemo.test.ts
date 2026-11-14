import { describe, expect, it } from 'vitest';
import { demoCanSee, visiblePosts, showcaseCards } from './personalProfileDemo';
describe('Stage 1 simulated audiences', () => {
  it('guest and unrelated members see only public', () => {
    for (const v of ['guest', 'unrelated'] as const) { expect(demoCanSee(v, 'public')).toBe(true); expect(demoCanSee(v, 'followers')).toBe(false); expect(demoCanSee(v, 'friends')).toBe(false); expect(demoCanSee(v, 'only_me')).toBe(false); }
  });
  it('followers see public and followers', () => { expect(demoCanSee('follower', 'followers')).toBe(true); expect(demoCanSee('follower', 'friends')).toBe(false); });
  it('close friends see friends but never only-me', () => { expect(demoCanSee('friend', 'friends')).toBe(true); expect(demoCanSee('friend', 'only_me')).toBe(false); });
  it('only-me posts never reach any visitor', () => { for (const v of ['guest', 'unrelated', 'follower', 'friend'] as const) expect(visiblePosts(v).some(p => p.audience === 'only_me')).toBe(false); });
  it('private cards never appear in Showcase, even for owner', () => { for (const v of ['owner', 'guest', 'follower', 'friend'] as const) expect(showcaseCards(v).some(c => c.audience === 'only_me')).toBe(false); });
});
