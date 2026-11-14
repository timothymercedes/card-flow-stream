// Who may open financial admin tools (insurance claims, evidence, shipping health).
// Moderators are intentionally excluded unless separately authorized.
export const FINANCIAL_ADMIN_ROLES = ["owner", "admin"] as const;
export function canAccessFinancialAdmin(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => (FINANCIAL_ADMIN_ROLES as readonly string[]).includes(String(r)));
}
