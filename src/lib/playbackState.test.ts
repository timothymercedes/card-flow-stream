import { describe, expect, it } from 'vitest';
import { playbackHasFrames, playbackRetryDelay, PLAYBACK_MAX_RECOVERIES } from './playbackState';
describe('live playback readiness', () => {
  it('never calls a connected but blank video live', () => {
    expect(playbackHasFrames({ readyState: 4, videoWidth: 0, videoHeight: 0, paused: false })).toBe(false);
  });
  it('requires actual playing frames', () => {
    expect(playbackHasFrames({ readyState: 4, videoWidth: 1280, videoHeight: 720, paused: true })).toBe(false);
    expect(playbackHasFrames({ readyState: 4, videoWidth: 1280, videoHeight: 720, paused: false })).toBe(true);
  });
  it('bounds retry count and exponential delay', () => {
    expect(PLAYBACK_MAX_RECOVERIES).toBe(6);
    expect(playbackRetryDelay(1)).toBe(1000);
    expect(playbackRetryDelay(6)).toBe(15000);
  });
});