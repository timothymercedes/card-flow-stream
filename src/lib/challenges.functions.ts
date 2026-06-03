// PullBid Live — Community Collection Challenges.
// Communities set a shared goal (usually completing a TCG set). Each member
// contributes the number of distinct cards from the target set they own.
// Aggregate progress drives the community toward the target.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeCollectionBooks } from "@/lib/collection.functions";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

type ChallengeRow = {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  set_name: string | null;
  category: string | null;
  target_count: number;
  ends_at: string | null;
  is_active: boolean;
  created_by: string;
};

async function decorate(supabaseAdmin: any, rows: ChallengeRow[], userId: string) {
  const ids = rows.map((r) => r.id);
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  const mine = new Map<string, number>();
  if (ids.length) {
    const { data: contribs } = await supabaseAdmin
      .from("community_challenge_contributions")
      .select("challenge_id, user_id, contribution")
      .in("challenge_id", ids);
    (contribs ?? []).forEach((c: any) => {
      totals.set(c.challenge_id, (totals.get(c.challenge_id) ?? 0) + Number(c.contribution || 0));
      counts.set(c.challenge_id, (counts.get(c.challenge_id) ?? 0) + 1);
      if (c.user_id === userId) mine.set(c.challenge_id, Number(c.contribution || 0));
    });
  }
  return rows.map((r) => {
    const progress = totals.get(r.id) ?? 0;
    return {
      id: r.id,
      communityId: r.community_id,
      title: r.title,
      description: r.description,
      setName: r.set_name,
      category: r.category,
      targetCount: r.target_count,
      endsAt: r.ends_at,
      isActive: r.is_active,
      createdBy: r.created_by,
      progress,
      contributors: counts.get(r.id) ?? 0,
      myContribution: mine.get(r.id) ?? 0,
      hasJoined: mine.has(r.id),
      percent: r.target_count > 0 ? Math.min(100, Math.round((progress / r.target_count) * 100)) : 0,
      complete: progress >= r.target_count && r.target_count > 0,
    };
  });
}

// List challenges for a community with live aggregate progress.
export const getCommunityChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { communityId: string }) =>
    z.object({ communityId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("community_challenges")
      .select("id, community_id, title, description, set_name, category, target_count, ends_at, is_active, created_by")
      .eq("community_id", data.communityId)
      .order("created_at", { ascending: false });
    return decorate(supabaseAdmin, (rows ?? []) as ChallengeRow[], userId);
  });

// Create a new community challenge.
export const createCommunityChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        communityId: z.string().uuid(),
        title: z.string().min(3).max(120),
        description: z.string().max(500).optional(),
        setName: z.string().max(120).optional(),
        category: z.string().max(60).optional(),
        targetCount: z.number().int().min(1).max(100000),
        endsAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    const { data: row, error } = await supabase
      .from("community_challenges")
      .insert({
        community_id: data.communityId,
        title: data.title,
        description: data.description ?? null,
        set_name: data.setName ?? null,
        category: data.category ?? null,
        target_count: data.targetCount,
        ends_at: data.endsAt ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// Join / refresh contribution: count distinct cards the user owns from the
// challenge's target set and upsert it as their contribution.
export const contributeToChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string }) =>
    z.object({ challengeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ch } = await supabaseAdmin
      .from("community_challenges")
      .select("id, set_name, category")
      .eq("id", data.challengeId)
      .maybeSingle();
    if (!ch) throw new Error("Challenge not found");

    let contribution = 0;
    if (ch.set_name) {
      const books = await computeCollectionBooks(supabaseAdmin, userId);
      const match = books.find(
        (b) =>
          norm(b.setName) === norm(ch.set_name) &&
          (!ch.category || norm(b.category) === norm(ch.category)),
      );
      contribution = match?.ownedDistinct ?? 0;
    }

    const { error } = await supabase
      .from("community_challenge_contributions")
      .upsert(
        { challenge_id: data.challengeId, user_id: userId, contribution },
        { onConflict: "challenge_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { contribution };
  });

// Leave a challenge (remove the user's contribution).
export const leaveChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { challengeId: string }) =>
    z.object({ challengeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    const { error } = await supabase
      .from("community_challenge_contributions")
      .delete()
      .eq("challenge_id", data.challengeId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
