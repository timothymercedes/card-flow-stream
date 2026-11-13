import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STORE_TYPE_LABEL, isValidStoreSlug, slugifyStoreName, type BazaarStoreType } from "@/lib/bazaar";
import { ShieldCheck, Store } from "lucide-react";

export const Route = createFileRoute("/admin/bazaar")({
  head: () => ({ meta: [
    { title: "PB Bazaar Review — PullBid Live Admin" },
    { name: "description", content: "Review PB Bazaar store applications and manage store status." },
    { property: "og:title", content: "PB Bazaar Review — PullBid Live Admin" },
    { property: "og:description", content: "Approve, reject or suspend PB Bazaar stores." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BazaarAdmin,
});

const TABS = [["pending_review", "Pending"], ["active", "Active"], ["rejected", "Rejected"], ["suspended", "Suspended"], ["draft", "Drafts"], ["closed", "Closed"]] as const;

function BazaarAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("pending_review");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pb, setPb] = useState({ name: "", slug: "", description: "" });
  const role = useQuery({ queryKey: ["bazaar", "is-admin", user?.id], enabled: !!user, queryFn: async () => {
    const { data } = await supabase.rpc("is_bazaar_admin", { _uid: user!.id }); return !!data;
  } });
  const stores = useQuery({ queryKey: ["bazaar", "admin-stores", tab], enabled: !!role.data, queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_stores").select("id, slug, name, store_type, status, verification_status, category, description, application_notes, review_notes, owner_id, created_at").eq("status", tab).order("created_at", { ascending: true }).limit(100);
    if (error) throw error; return data ?? [];
  } });

  async function decide(id: string, patch: Record<string, unknown>, msg: string) {
    const { error } = await supabase.from("bazaar_stores").update({ ...patch, review_notes: notes[id]?.trim() || null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(msg); qc.invalidateQueries({ queryKey: ["bazaar"] });
  }

  async function createPb(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidStoreSlug(pb.slug)) return toast.error("Invalid store link");
    const { error } = await supabase.from("bazaar_stores").insert({ owner_id: user!.id, name: pb.name.trim(), slug: pb.slug, description: pb.description || null, store_type: "pb_owned", status: "active", verification_status: "verified" });
    if (error) return toast.error(error.code === "23505" ? "Store link taken" : error.message);
    toast.success("PB store created"); setPb({ name: "", slug: "", description: "" }); qc.invalidateQueries({ queryKey: ["bazaar"] });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-4">
        <h1 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-primary" /> PB Bazaar review</h1>
        {!user ? <p className="text-sm">Sign in as an admin.</p> : role.isLoading ? <p className="text-sm text-muted-foreground">Checking access…</p> : !role.data ? (
          <p role="alert" className="text-sm text-destructive">Admins only.</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto">{TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tab === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border text-muted-foreground"}`}>{l}</button>
            ))}</div>
            {stores.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !stores.data?.length ? (
              <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">Nothing here.</p>
            ) : (
              <ul className="space-y-3">{stores.data.map((s) => (
                <li key={s.id} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{s.name} <span className="text-sm font-normal text-muted-foreground">/{s.slug}</span></p>
                      <p className="text-xs text-muted-foreground">{STORE_TYPE_LABEL[s.store_type as BazaarStoreType]} · {s.category || "No category"} · verification: {s.verification_status} · applied {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    {s.status === "active" && <Link to="/bazaar/stores/$slug" params={{ slug: s.slug }} className="text-sm font-semibold text-primary">View store</Link>}
                  </div>
                  {s.description && <p className="text-sm">{s.description}</p>}
                  {s.application_notes && <p className="rounded-lg bg-muted p-2 text-xs"><span className="font-bold">Applicant details: </span>{s.application_notes}</p>}
                  {s.review_notes && <p className="text-xs text-muted-foreground">Last review note: {s.review_notes}</p>}
                  <Textarea placeholder="Review note (shown to the applicant)" value={notes[s.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} className="min-h-[60px]" />
                  <div className="flex flex-wrap gap-2">
                    {s.status !== "active" && <Button size="sm" onClick={() => decide(s.id, { status: "active", verification_status: "verified" }, "Store approved")}>Approve</Button>}
                    {s.status === "pending_review" && <Button size="sm" variant="outline" onClick={() => decide(s.id, { status: "rejected", verification_status: "rejected" }, "Application rejected")}>Reject</Button>}
                    {s.status === "active" && <Button size="sm" variant="destructive" onClick={() => decide(s.id, { status: "suspended" }, "Store suspended")}>Suspend</Button>}
                  </div>
                </li>
              ))}</ul>
            )}
            <form onSubmit={createPb} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="flex items-center gap-1.5 font-bold"><Store className="h-4 w-4" /> Create a PB-owned store</p>
              <Input required placeholder="Store name" value={pb.name} onChange={(e) => setPb((p) => ({ ...p, name: e.target.value, slug: slugifyStoreName(e.target.value) }))} />
              <Input required placeholder="store-link" value={pb.slug} onChange={(e) => setPb((p) => ({ ...p, slug: e.target.value.toLowerCase() }))} />
              <Textarea placeholder="Description" value={pb.description} onChange={(e) => setPb((p) => ({ ...p, description: e.target.value }))} />
              <Button type="submit" size="sm">Create and publish</Button>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
