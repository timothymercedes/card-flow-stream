import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_CONNECTION_TIMEOUT_MS, waitForLiveConnection } from './liveConnection';

class Peer extends EventTarget {
  connectionState: RTCPeerConnectionState = 'connecting';
  change(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

afterEach(() => vi.useRealTimers());
describe('live connection readiness', () => {
  it('accepts a connection that completes after the former ten-second cutoff', async () => {
    vi.useFakeTimers();
    const peer = new Peer();
    const result = waitForLiveConnection(peer);
    await vi.advanceTimersByTimeAsync(25_000);
    peer.change('connected');
    expect(await result).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not advertise a peer that never connects', async () => {
    vi.useFakeTimers();
    const result = waitForLiveConnection(new Peer());
    await vi.advanceTimersByTimeAsync(LIVE_CONNECTION_TIMEOUT_MS);
    expect(await result).toBe(false);
  });
  it('stops waiting when the peer is closed', async () => {
    vi.useFakeTimers();
    const peer = new Peer();
    const result = waitForLiveConnection(peer);
    peer.change('closed');
    expect(await result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});