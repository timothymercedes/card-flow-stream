/** Server-side release switch for real visitor access. Pure so both states are testable.
 * OFF (default): only an isolated local backend, never a published domain.
 * ON: only when the server env PERSONAL_PROFILE_VISITORS_RELEASED is exactly "true". */
export const RELEASE_ENV = 'PERSONAL_PROFILE_VISITORS_RELEASED';
export const RELEASED_HOSTS = ['pullbidlive.com', 'www.pullbidlive.com', 'card-flow-stream.lovable.app'];
const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'];

export function visitorGateDecision(input: { releaseFlag: string | undefined; backendUrl: string | undefined; requestUrl: string }): { allowed: boolean; reason: string } {
  if (input.releaseFlag === 'true') return { allowed: true, reason: 'released' };
  let backend = '';
  try { backend = input.backendUrl ? new URL(input.backendUrl).hostname : ''; } catch { backend = ''; }
  if (!LOCAL.includes(backend)) return { allowed: false, reason: 'Personal profile visitors are disabled.' };
  let host = '';
  try { host = new URL(input.requestUrl).hostname; } catch { return { allowed: false, reason: 'Invalid request.' }; }
  if (RELEASED_HOSTS.includes(host)) return { allowed: false, reason: 'Personal profile is not released.' };
  return { allowed: true, reason: 'isolated' };
}
