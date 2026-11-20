import { describe, it, expect } from "vitest";
import { matchesRetainedFilter, retainedStatus, type RetainedItem } from "./retainedContent";
const base: RetainedItem = { id: "1", kind: "post", user_id: "u", caption: "", media_url: null, created_at: "", visibility: "public", moderation_status: "approved", deleted_at: null, deleted_by: null, deletion_reason: null, previous_visibility: null, retain_until: null, report_count: 0 };
describe("retained content filters", () => {
  it("labels owner deletions as Deleted by Owner", () => {
    expect(retainedStatus({ ...base, deleted_by: "owner" })).toBe("deleted_owner");
  });
  it("labels admin removals as Removed by Admin", () => {
    expect(retainedStatus({ ...base, deleted_by: "admin" })).toBe("removed_admin");
  });
  it("Active excludes deleted content", () => {
    expect(matchesRetainedFilter({ ...base, deleted_at: "x", deleted_by: "owner" }, "active")).toBe(false);
    expect(matchesRetainedFilter(base, "active")).toBe(true);
  });
  it("Reported includes deleted items that were reported", () => {
    expect(matchesRetainedFilter({ ...base, deleted_by: "owner", deleted_at: "x", report_count: 2 }, "reported")).toBe(true);
  });
});
