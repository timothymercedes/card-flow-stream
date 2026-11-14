export const PERSONAL_PROFILE_TABS = ['Posts', 'About', 'Photos', 'Videos', 'Collectibles', 'Activity'] as const;
export type PersonalProfileTab = typeof PERSONAL_PROFILE_TABS[number];
export function canReadPersonalTimeline(viewerId: string | undefined, ownerId: string) {
  return Boolean(viewerId && viewerId === ownerId);
}
export function personalPreviewEnabled(development: boolean) { return development; }
export function personalDraftKey(ownerId: string) { return `personal-profile-preview:${ownerId}`; }