export const RETAINED_FILTERS = ["all", "active", "deleted_owner", "reported", "under_review", "removed_admin"] as const;
export type RetainedFilter = (typeof RETAINED_FILTERS)[number];
export const RETENTION_DAYS = 90;
export type RetainedItem = {
  id: string; kind: "post" | "story"; user_id: string; caption: string | null; media_url: string | null;
  created_at: string; visibility: string; moderation_status: string; deleted_at: string | null;
  deleted_by: "owner" | "admin" | null; deletion_reason: string | null; previous_visibility: string | null;
  retain_until: string | null; expires_at?: string | null; report_count: number;
};
export function retainedStatus(i: Pick<RetainedItem, "deleted_by" | "moderation_status" | "report_count">) {
  if (i.deleted_by === "admin") return "removed_admin";
  if (i.deleted_by === "owner") return "deleted_owner";
  if (i.moderation_status !== "approved") return "under_review";
  if (i.report_count > 0) return "reported";
  return "active";
}
export function matchesRetainedFilter(i: RetainedItem, f: RetainedFilter) {
  if (f === "all") return true;
  if (f === "reported") return i.report_count > 0;
  if (f === "under_review") return i.moderation_status !== "approved";
  return retainedStatus(i) === f;
}
