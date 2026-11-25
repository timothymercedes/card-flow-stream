import { easternWeekStart } from "./feePolicy";

const DAY = 86_400_000;

/** Original payment weeks still inside (or just past) their 14-day verification window. */
export function openReviewWeeks(now = new Date()): Date[] {
  const current = easternWeekStart(now);
  return [0, 1, 2, 3].map((n) => easternWeekStart(new Date(current.getTime() - n * 7 * DAY + 12 * 3_600_000)));
}

export async function refreshSellerWeeks(admin: any, sellerId: string, weeks: Date[]) {
  const rows: any[] = [];
  for (const w of weeks) {
    const { data, error } = await admin.rpc("refresh_seller_vip_review", { _seller_id: sellerId, _week_start: w.toISOString() });
    if (error) throw new Error(error.message);
    rows.push(data);
  }
  return rows;
}

export async function assertStaff(admin: any, userId: string) {
  const [{ data: a }, { data: o }] = await Promise.all([
    admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    admin.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  if (!a && !o) throw new Error("Admin only");
}
