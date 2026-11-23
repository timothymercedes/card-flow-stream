export function canEndLiveSession(ownerId: string, viewerId: string, roles: string[]): boolean {
  return ownerId === viewerId || roles.some(role => role === 'owner' || role === 'admin');
}
export function endedSessionPatch(endedAt: string) {
  // Never alter transaction, bid, winner, recording or activity fields.
  return { status: 'ended', is_active: false, ended_at: endedAt, pause_until: null };
}
export async function disableBroadcast(account: string, token: string, inputId: string, request: typeof fetch = fetch): Promise<void> {
  if (!/^[a-f0-9]{32}$/i.test(inputId) || !/^[a-f0-9]{32}$/i.test(account)) throw new Error('Broadcast identifier is invalid.');
  const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/stream/live_inputs/${inputId}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('The broadcast could not be stopped. Please retry.');
  const result = await response.json() as { success?: boolean; result?: { enabled?: boolean } };
  if (!result.success || result.result?.enabled !== false) throw new Error('Broadcast shutdown was not confirmed. Please retry.');
}