import { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Saves the current marketplace search; the database alerts the user when a matching item is listed. */
export function SaveSearchButton({ query, department, maxPrice }: { query: string; department: string; maxPrice?: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!user) { toast("Sign in to save searches and get alerts."); return; }
    setBusy(true);
    const max = maxPrice && Number(maxPrice) > 0 ? Number(maxPrice) : null;
    const { error } = await supabase.from("saved_searches").insert({ user_id: user.id, query: query.trim().slice(0, 120), department: department || "all", max_price: max });
    setBusy(false);
    if (error) toast.error("Couldn't save this search. Please try again.");
    else toast.success("Search saved — we'll alert you when a match is listed.");
  }
  return (
    <button onClick={save} disabled={busy} aria-label="Save search and get alerts"
      className="flex items-center gap-1 rounded-full bg-input/60 px-3 py-2 text-xs font-semibold ring-1 ring-border/60 hover:bg-muted/70 disabled:opacity-50">
      <Bell className="h-3.5 w-3.5" /><span className="hidden sm:inline">Save search</span>
    </button>
  );
}
