import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Disc3, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/collection-wheel")({
  head: () => ({ meta: [{ title: "Reward Wheel — Admin" }] }),
  component: Page,
});

type Slot = {
  id: string;
  label: string;
  rarity: string;
  reward_kind: string;
  reward_slug: string | null;
  credits: number;
  xp: number;
  color: string;
  weight: number;
  is_active: boolean;
  sort_order: number;
};

const RARITY_CLASS: Record<string, string> = {
  common: "text-slate-400 border-slate-400/40",
  rare: "text-blue-400 border-blue-400/40",
  epic: "text-purple-400 border-purple-400/40",
  legendary: "text-amber-400 border-amber-400/50",
};

function Page() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Slot[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = ((data ?? []) as any[]).map((r) => r.role);
      setIsAdmin(roles.includes("admin") || roles.includes("owner"));
    });
  }, [user, authLoading]);

  async function load() {
    const { data } = await supabase
      .from("collection_wheel_slots" as any)
      .select("*")
      .order("sort_order");
    setRows((data ?? []) as unknown as Slot[]);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const totalWeight = rows.filter((r) => r.is_active).reduce((a, r) => a + (r.weight || 0), 0) || 1;

  function patch(id: string, p: Partial<Slot>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  async function save(s: Slot) {
    setSaving(s.id);
    try {
      const { error } = await supabase
        .from("collection_wheel_slots" as any)
        .update({ weight: s.weight, credits: s.credits, xp: s.xp, is_active: s.is_active } as any)
        .eq("id", s.id);
      if (error) throw error;
      toast.success(`Saved ${s.label}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (isAdmin === false) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">Admins only.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <header className="flex items-center gap-2">
          <Disc3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Collection Reward Wheel</h1>
            <p className="text-xs text-muted-foreground">Tune drop probabilities and reward values — no code changes needed.</p>
          </div>
        </header>

        <div className="space-y-2">
          {rows.map((s) => {
            const pct = s.is_active ? Math.round((s.weight / totalWeight) * 1000) / 10 : 0;
            return (
              <Card key={s.id} className={`p-3 ${RARITY_CLASS[s.rarity] ?? ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{s.label}</p>
                    <Badge variant="outline" className={`mt-0.5 text-[10px] capitalize ${RARITY_CLASS[s.rarity] ?? ""}`}>
                      {s.rarity} · {s.reward_kind}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{pct}%</p>
                    <p className="text-[10px] text-muted-foreground">drop chance</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 items-end gap-2">
                  <label className="text-[10px] text-muted-foreground">
                    Weight
                    <Input type="number" min={0} value={s.weight}
                      onChange={(e) => patch(s.id, { weight: Number(e.target.value) })} className="mt-1 h-8" />
                  </label>
                  <label className="text-[10px] text-muted-foreground">
                    Credits
                    <Input type="number" min={0} value={s.credits}
                      onChange={(e) => patch(s.id, { credits: Number(e.target.value) })} className="mt-1 h-8" />
                  </label>
                  <label className="text-[10px] text-muted-foreground">
                    XP
                    <Input type="number" min={0} value={s.xp}
                      onChange={(e) => patch(s.id, { xp: Number(e.target.value) })} className="mt-1 h-8" />
                  </label>
                  <div className="flex items-center gap-2 pb-1">
                    <Switch checked={s.is_active} onCheckedChange={(v) => patch(s.id, { is_active: v })} />
                    <span className="text-[10px] text-muted-foreground">Active</span>
                  </div>
                </div>
                <Button size="sm" className="mt-3 h-8" disabled={saving === s.id} onClick={() => save(s)}>
                  <Save className="mr-1 h-3.5 w-3.5" /> {saving === s.id ? "Saving…" : "Save"}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
