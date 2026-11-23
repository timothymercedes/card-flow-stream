/** ICE negotiation can take longer on mobile networks; advertise only a connected peer. */
export const LIVE_CONNECTION_TIMEOUT_MS = 45_000;

export function waitForLiveConnection(
  peer: Pick<RTCPeerConnection, 'connectionState' | 'addEventListener' | 'removeEventListener'>,
): Promise<boolean> {
  if (peer.connectionState === 'connected') return Promise.resolve(true);
  if (peer.connectionState === 'failed' || peer.connectionState === 'closed') return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (connected: boolean) => {
      clearTimeout(timer);
      peer.removeEventListener('connectionstatechange', changed);
      resolve(connected);
    };
    const changed = () => {
      if (peer.connectionState === 'connected') finish(true);
      else if (peer.connectionState === 'failed' || peer.connectionState === 'closed') finish(false);
    };
    const timer = setTimeout(() => finish(peer.connectionState === 'connected'), LIVE_CONNECTION_TIMEOUT_MS);
    peer.addEventListener('connectionstatechange', changed);
    changed();
  });
}