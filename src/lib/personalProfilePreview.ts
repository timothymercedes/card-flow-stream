export const PERSONAL_PROFILE_TABS = ['Posts', 'About', 'Photos', 'Videos', 'Collectibles', 'Activity'] as const;
export type PersonalProfileTab = typeof PERSONAL_PROFILE_TABS[number];
export function canReadPersonalTimeline(viewerId: string | undefined, ownerId: string) {
  return Boolean(viewerId && viewerId === ownerId);
}
export function personalPreviewEnabled(development: boolean, hostname = '') {
  if (development) return true;
  const host = hostname.toLowerCase();
  if (/^[a-z0-9-]+\.(?:lovableproject\.com|lovableproject-dev\.com)$/.test(host)) return true;
  const suffix = ['.lovable.app', '.gpt-eng.com', '.gptengineer.run'].find(value => host.endsWith(value));
  if (!suffix) return false;
  const labels = host.slice(0, -suffix.length).split('.');
  const first = labels[0] ?? '';
  return (labels.length <= 2 && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(first))
    || (labels.length === 2 && /^live--[0-9a-f-]{36}(?:-thr_[a-z0-9]+)?$/.test(first))
    || (labels.length === 1 && /^project--[0-9a-f-]{36}-dev$/.test(first));
}
export function personalDraftKey(ownerId: string) { return `personal-profile-preview:${ownerId}`; }
export const PERSONAL_PROFILE_PREVIEW_PATH = '/preview/personal-profile';
export type PersonalPreviewView = 'owner' | 'visitor';
export function parsePersonalPreviewView(value: unknown): PersonalPreviewView | undefined {
  return value === 'visitor' || value === 'owner' ? value : undefined;
}
