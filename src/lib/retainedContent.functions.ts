import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RetainedItem } from "./retainedContent";

async function staff(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).in("role", ["admin", "owner", "moderator"]);
  if (!data?.length) throw new Error("forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
const storyPath = (u: string) => u.split("/stories/").pop()?.split("?")[0] || "";

export const listRetainedContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ username: z.string().trim().min(1).max(60), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staff(context);
    const name = data.username.replace(/^@/, "").replace(/[^a-zA-Z0-9_.-]/g, "");
    const { data: prof } = await db.from("profiles").select("id, username, avatar_url").ilike("username", name).maybeSingle();
    if (!prof) return { profile: null, items: [] as RetainedItem[] };
    const [posts, stories] = await Promise.all([
      db.from("posts").select("*").eq("user_id", prof.id).order("created_at", { ascending: false }).limit(300),
      db.from("stories").select("*").eq("user_id", prof.id).order("created_at", { ascending: false }).limit(300),
    ]);
    const ids = [...(posts.data || []), ...(stories.data || [])].map((r: any) => r.id);
    const { data: reps } = ids.length ? await db.from("user_reports").select("target_id").in("target_id", ids) : { data: [] };
    const counts = new Map<string, number>();
    for (const r of reps || []) counts.set(r.target_id, (counts.get(r.target_id) || 0) + 1);
    const paths = (stories.data || []).map((s: any) => storyPath(s.image_url)).filter(Boolean);
    const { data: signed } = paths.length ? await db.storage.from("stories").createSignedUrls(paths, 600) : { data: [] };
    const byPath = new Map((signed || []).map((x: any) => [x.path, x.signedUrl]));
    const pick = (r: any, kind: "post" | "story"): RetainedItem => ({
      id: r.id, kind, user_id: r.user_id, caption: r.caption, created_at: r.created_at, visibility: r.visibility,
      media_url: kind === "story" ? (byPath.get(storyPath(r.image_url)) as string) || null : r.image_url,
      moderation_status: r.moderation_status, deleted_at: r.deleted_at, deleted_by: r.deleted_by, deletion_reason: r.deletion_reason,
      previous_visibility: r.previous_visibility, retain_until: r.retain_until, expires_at: r.expires_at ?? null, report_count: counts.get(r.id) || 0,
    });
    const items = [...(posts.data || []).map((r: any) => pick(r, "post")), ...(stories.data || []).map((r: any) => pick(r, "story"))]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    await db.from("admin_action_log").insert({ admin_id: context.userId, action: "retained_content.viewed", target_table: "profiles", target_id: prof.id, subject_user_id: prof.id, reason: data.reason, after_state: { items: items.length, deleted: items.filter((i) => i.deleted_at).length } });
    return { profile: { id: prof.id, username: prof.username }, items };
  });

export const actOnRetainedContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: z.enum(["post", "story"]), id: z.string().uuid(), action: z.enum(["remove", "restore_private"]), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staff(context);
    const table = data.kind === "post" ? "posts" : "stories";
    const { data: before } = await db.from(table).select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("not_found");
    // Restore never returns content to the public: it goes back to owner-only visibility.
    const patch = data.action === "remove"
      ? { deleted_at: before.deleted_at ?? new Date().toISOString(), deleted_by: "admin", deletion_reason: data.reason, previous_visibility: before.previous_visibility ?? before.visibility, retain_until: new Date(Date.now() + 90 * 864e5).toISOString() }
      : { deleted_at: null, deleted_by: null, deletion_reason: null, retain_until: null, visibility: "private" };
    const { data: after, error } = await db.from(table).update(patch).eq("id", data.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    await db.from("admin_action_log").insert({ admin_id: context.userId, action: `retained_content.${data.action}`, target_table: table, target_id: data.id, subject_user_id: before.user_id, before_state: before, after_state: after, reason: data.reason });
    return { ok: true };
  });
