import { supabase } from "@/integrations/supabase/client";

export type ComboResult = { combo_count: number; best_combo: number };

/**
 * Bump the per-stream combo counter for the current user. Server-validated:
 * resets to 1 if more than 20s passed since last bid. Returns null if unauth.
 */
export async function bumpCombo(streamId: string): Promise<ComboResult | null> {
  const { data, error } = await (supabase.rpc as any)("bump_combo_streak", { _stream_id: streamId });
  if (error) { console.warn("[combo] bump failed", error.message); return null; }
  return (Array.isArray(data) ? data[0] : data) as ComboResult;
}
