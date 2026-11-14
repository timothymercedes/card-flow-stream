import { describe, expect, it } from 'vitest';
import { canReadPersonalTimeline, personalPreviewEnabled, personalDraftKey } from './personalProfilePreview';
describe('preview profile approval boundaries', () => {
  it('does not activate the redesign on the public build', () => {
    expect(personalPreviewEnabled(false)).toBe(false);
    expect(personalPreviewEnabled(true)).toBe(true);
  });
  it('activates hosted previews even when compiled for production', () => {
    for (const host of ['id-preview--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app', 'id-preview-6--project.lovable.app', 'id-preview-abc123--project.lovable.app', 'preview--example.team.gpt-eng.com', 'live--c81c8301-d89c-4830-8ab7-06f678968bc1.team.lovable.app']) {
      expect(personalPreviewEnabled(false, host)).toBe(true);
    }
  });
  it('keeps live domains and lookalike hosts on the existing profile', () => {
    for (const host of ['pullbidlive.com', 'www.pullbidlive.com', 'card-flow-stream.lovable.app', 'project--c81c8301-d89c-4830-8ab7-06f678968bc1.lovable.app', 'preview--example.evil.com', 'id-preview--example.lovable.app.evil.com']) {
      expect(personalPreviewEnabled(false, host)).toBe(false);
    }
  });
  it('shows the redesign inside embedded live preview hosts', () => {
    expect(personalPreviewEnabled(false, 'c81c8301-d89c-4830-8ab7-06f678968bc1.lovableproject.com')).toBe(true);
    expect(personalPreviewEnabled(false, 'c81c8301-d89c-4830-8ab7-06f678968bc1.lovableproject-dev.com')).toBe(true);
    expect(personalPreviewEnabled(false, 'example.lovableproject.com.evil.com')).toBe(false);
  });
  it('reads the existing timeline only for its owner until privacy approval', () => {
    expect(canReadPersonalTimeline('owner', 'owner')).toBe(true);
    expect(canReadPersonalTimeline('visitor', 'owner')).toBe(false);
    expect(canReadPersonalTimeline(undefined, 'owner')).toBe(false);
  });
  it('separates browser drafts between accounts', () => {
    expect(personalDraftKey('one')).not.toBe(personalDraftKey('two'));
  });
});
import { parsePersonalPreviewView } from './personalProfilePreview';
describe('direct preview address', () => {
  it('opens visitor view only when explicitly requested', () => {
    expect(parsePersonalPreviewView('visitor')).toBe('visitor');
    expect(parsePersonalPreviewView('owner')).toBe('owner');
    expect(parsePersonalPreviewView('admin')).toBeUndefined();
    expect(parsePersonalPreviewView(undefined)).toBeUndefined();
  });
});
