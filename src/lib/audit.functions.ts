import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
        action: z.string().max(64).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("admin_list_audit_logs", {
      _limit: data.limit ?? 50,
      _offset: data.offset ?? 0,
      _action: data.action ?? null,
    });
    if (error) return { rows: [], error: error.message };
    return { rows: rows ?? [], error: null };
  });
