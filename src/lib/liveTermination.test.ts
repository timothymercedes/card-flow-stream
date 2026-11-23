import { expect, it, vi } from 'vitest';
import { canEndLiveSession, disableBroadcast, endedSessionPatch } from './liveTermination';
it('only verified seller or admin/owner may end a session', () => {
  expect(canEndLiveSession('seller', 'seller', [])).toBe(true);
  expect(canEndLiveSession('seller', 'admin', ['admin'])).toBe(true);
  expect(canEndLiveSession('seller', 'owner', ['owner'])).toBe(true);
  expect(canEndLiveSession('seller', 'visitor', ['moderator'])).toBe(false);
});
it('ending retains bids, transactions, recordings and activity', () => {
  expect(endedSessionPatch('2026-11-23T17:44:00.000Z')).toEqual({ status: 'ended', is_active: false, ended_at: '2026-11-23T17:44:00.000Z', pause_until: null });
});
it('disables input without deleting recordings and confirms shutdown', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true, result: { enabled: false } }));
  await disableBroadcast('a'.repeat(32), 'test-token', 'b'.repeat(32), request);
  expect(request.mock.calls[0]?.[1]?.method).toBe('PUT');
  expect(request.mock.calls[0]?.[1]?.body).toBe('{"enabled":false}');
  request.mockResolvedValue(Response.json({ success: true, result: { enabled: true } }));
  await expect(disableBroadcast('a'.repeat(32), 'test-token', 'b'.repeat(32), request)).rejects.toThrow('not confirmed');
});