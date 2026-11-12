import { supabase } from "@/integrations/supabase/client";

export async function listPublicUpcomingQueue(streamId: string) {
  const { data, error } = await supabase.rpc("list_public_upcoming_queue", { _stream_id: streamId });
  if (error) throw error;
  return data ?? [];
}