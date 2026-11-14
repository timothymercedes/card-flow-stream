import { describe,it,expect } from 'vitest';
import { candidatePost, candidateIdentity, candidateMedia, isCandidateObjectPath, CANDIDATE_VISITORS_ENABLED, candidatePostLink } from './personalProfileCandidate';
describe('real-account candidate boundaries', () => {
  it('keeps visitors locked until full safeguards pass', () => expect(CANDIDATE_VISITORS_ENABLED).toBe(false));
  it('edits preserve the exact existing post ID', () => { const id='11111111-1111-4111-8111-111111111111'; expect(candidatePost.parse({id,caption:'Updated',audience:'only_me'}).id).toBe(id); });
  it('preserves only-me rather than converting private choices', () => expect(candidatePost.parse({caption:'Private',audience:'only_me'}).audience).toBe('only_me'));
  it('rejects raw customer image URLs as object bindings', () => expect(isCandidateObjectPath('owner','https://example.com/storage/vault-images/photo.jpg')).toBe(false));
  it('rejects encoded aliases and traversal', () => { expect(isCandidateObjectPath('owner','owner/%2e%2e/photo')).toBe(false); expect(isCandidateObjectPath('owner','owner/../photo')).toBe(false); });
  it('rejects another owner object', () => expect(isCandidateObjectPath('owner','other/photo.jpg')).toBe(false));
  it('permits exact owner binding', () => expect(isCandidateObjectPath('owner','owner/photo.jpg')).toBe(true));
  it('rejects private account columns on social identity by stripping them', () => expect(candidateIdentity.parse({username:'collector',display_name:'Collector',bio:'',audience:'only_me',phone:'private'})).not.toHaveProperty('phone'));
  it('video requires a post not a cover', () => expect(candidateMedia.safeParse({post_id:null,slot:'cover0',kind:'video',extension:'mp4'}).success).toBe(false));
  it('post links stay separate from commerce and account management', () => expect(candidatePostLink('collector','p1')).toBe('/@collector#post-p1'));
});