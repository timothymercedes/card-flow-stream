export type PlaybackState = 'connecting' | 'live' | 'reconnecting' | 'failed';
export const PLAYBACK_STALL_MS = 15_000;
export const PLAYBACK_MAX_RECOVERIES = 6;
export function playbackHasFrames(video: Pick<HTMLVideoElement, 'readyState' | 'videoWidth' | 'videoHeight' | 'paused'>): boolean {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused;
}
export function playbackRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), 15_000);
}