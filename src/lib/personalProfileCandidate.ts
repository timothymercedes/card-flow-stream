import { z } from 'zod';

export const CANDIDATE_PATH = '/preview/personal-profile-candidate';
export const candidateAudience = z.enum(['public', 'followers', 'friends', 'only_me']);
export const candidateIdentity = z.object({ username: z.string().regex(/^[a-z0-9_.]{3,40}$/), display_name: z.string().trim().min(1).max(100), bio: z.string().max(1000), audience: candidateAudience });
export const candidatePost = z.object({ id: z.string().uuid().optional(), caption: z.string().trim().min(1).max(5000), audience: candidateAudience, collectible_id: z.string().uuid().nullable().default(null) });
export const candidateMedia = z.object({ post_id: z.string().uuid().nullable(), slot: z.enum(['post', 'avatar', 'cover0', 'cover1', 'cover2']), kind: z.enum(['image', 'video']), extension: z.enum(['jpg', 'png', 'webp', 'mp4', 'webm']) }).refine(v => v.slot === 'post' ? v.post_id !== null : v.post_id === null && v.kind === 'image', 'Media slot mismatch');
export function candidateProfileLink(username: string) { return `${CANDIDATE_PATH}?username=${encodeURIComponent(username)}`; }
export function candidatePostLink(username: string, id: string) { return `${candidateProfileLink(username)}#post-${encodeURIComponent(id)}`; }
export function isCandidateObjectPath(owner: string, path: string) { return path.startsWith(`${owner}/`) && !/[?%#]/.test(path) && !path.split('/').some(p => p === '..' || p === '.' || !p); }
export const CANDIDATE_VISITORS_ENABLED = false;