import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Elig = { allowed: boolean; reason?: string; available_at?: string };

export function eligibilityMessage(e: Elig | null): string | null {
  if (!e || e.allowed) return null;
  if (e.reason === "under_review") return "Username changes are paused while your account is under review.";
  if (e.reason === "cooldown" && e.available_at) {
    const days = Math.max(1, Math.ceil((new Date(e.available_at).getTime() - Date.now()) / 86400000));
    return `You can change your username again in ${days} day${days === 1 ? "" : "s"} (${new Date(e.available_at).toLocaleDateString()}).`;
  }
  return "Username changes are not available right now.";
}

export function PrivacyIdentitySettings({ userId }: { userId: string }) {
  const [p, setP] = useState<any>(null);
  const [elig, setElig] = useState<Elig | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data }, { data: e }] = await Promise.all([
      supabase.from("profiles").select("username,show_followers_list,show_following_list,created_at").eq("id", userId).maybeSingle(),
      (supabase.rpc as any)("username_change_eligibility", { _user_id: userId }),
    ]);
    setP(data); setName(data?.username ?? ""); setElig(e as Elig);
  }
  useEffect(() => { void load(); }, [userId]);

  async function toggle(field: "show_followers_list" | "show_following_list", v: boolean) {
    setP({ ...p, [field]: v });
    const { error } = await supabase.from("profiles").update({ [field]: v } as any).eq("id", userId);
    if (error) { toast.error("Could not save"); void load(); } else toast.success("Privacy updated");
  }

  async function changeUsername() {
    const clean = name.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(clean)) return toast.error("3–30 letters, numbers, _ or .");
    if (clean === p?.username) return;
    if (!confirm(`Change your username to @${clean}? Your old links will redirect to the new name.`)) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ username: clean }).eq("id", userId);
    setSaving(false);
    if (error) toast.error(error.message.includes("duplicate") ? "That username is taken" : error.message);
    else toast.success("Username updated");
    void load();
  }

  if (!p) return <div className="rounded-xl bg-card p-6 text-xs text-muted-foreground">Loading…</div>;
  const lockMsg = eligibilityMessage(elig);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 space-y-3">
        <p className="text-sm font-bold">Who can see my lists</p>
        {([["show_followers_list", "Show my followers list"], ["show_following_list", "Show who I follow"]] as const).map(([f, label]) => (
          <label key={f} className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>{label}</span>
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={!!p[f]} onChange={(e) => toggle(f, e.target.checked)} />
          </label>
        ))}
        <p className="text-[11px] text-muted-foreground">When off, other people see your count but not the names.</p>
      </div>
      <div className="rounded-xl bg-card p-4 space-y-2">
        <p className="text-sm font-bold">Username</p>
        <p className="text-[11px] text-muted-foreground">Your account ID never changes. Old profile links redirect to your new name, and your former names can't be claimed by anyone else.</p>
        {lockMsg ? (
          <p className="rounded-lg bg-muted p-3 text-xs">{lockMsg}</p>
        ) : (
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm" aria-label="New username" />
            <button disabled={saving} onClick={changeUsername} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
