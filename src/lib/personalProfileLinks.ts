import { candidateProfileLink } from './personalProfileCandidate';

// Social notification types whose /seller/<username> link names a person, not a shop.
const SOCIAL_TYPES = new Set(['new_follower', 'follow', 'mention', 'comment', 'reaction', 'like']);

/** In preview, send social notifications to the personal profile; commerce links never change. */
export function socialNotificationLink(type: string, link: string | null, personal: boolean): string | null {
  if (!link || !personal || !SOCIAL_TYPES.has(type)) return link;
  const m = /^\/seller\/([A-Za-z0-9_.]{3,40})$/.exec(link);
  return m ? candidateProfileLink(m[1].toLowerCase()) : link;
}
