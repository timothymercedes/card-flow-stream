export const ADMINISTRATION_SECTIONS = ['overview', 'members', 'administrators', 'live', 'reports', 'stores', 'finance', 'notifications', 'settings', 'audit'] as const;
export type AdministrationSection = typeof ADMINISTRATION_SECTIONS[number];
// Membership/group expansion is deliberately deferred; only existing protected leaders enter.
export function canEnterAdministration(roles: readonly string[]) {
  return roles.includes('owner') || roles.includes('admin');
}
export function administrationSection(value: unknown): AdministrationSection {
  return ADMINISTRATION_SECTIONS.find(section => section === value) ?? 'overview';
}