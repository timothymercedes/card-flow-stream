import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Trash2, Plus } from "lucide-react";

type Invite = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
};

function genCode() {
  const part = () =>
    Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
  return `${part()}-${part()}`;
}

export function BetaInvitesAdmin() {
  const [rows, setRows] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from("beta_invites")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as Invite[]) || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    setLoading(true);
    const code = genCode();
    const { error } = await supabase.from("beta_invites").insert({
      code,
      label: label || null,
      max_uses: Math.max(1, maxUses),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setLabel("");
    setMaxUses(1);
    toast.success(`Created ${code}`);
    refresh();
  }

  async function toggle(row: Invite) {
    const { error } = await supabase
      .from("beta_invites")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function remove(row: Invite) {
    if (!confirm(`Delete invite ${row.code}?`)) return;
    const { error } = await supabase.from("beta_invites").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-bold">Create Beta Invite</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. 'Tester John')"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(parseInt(e.target.value, 10) || 1)}
            placeholder="Max uses"
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3 text-sm font-bold">Invite codes ({rows.length})</div>
        <div className="divide-y divide-border">
          {rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No invites yet.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{r.code}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(r.code);
                    toast.success("Copied");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{r.label || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.use_count}/{r.max_uses} used
                    {r.last_used_at ? ` • last ${new Date(r.last_used_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => toggle(r)}
                  className={`rounded px-2 py-1 text-[11px] ${
                    r.active ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.active ? "Active" : "Disabled"}
                </button>
                <button
                  onClick={() => remove(r)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
