import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Registers the client-side middleware that attaches the authenticated user's
// Supabase bearer token to every server-function RPC. Without this, any server
// function using `requireSupabaseAuth` rejects with a 401 Response.
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
