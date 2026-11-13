import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BAZAAR_DEPARTMENTS, isValidStoreSlug, slugifyStoreName } from "@/lib/bazaar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/bazaar/apply")({
  head: () => ({ meta: [
    { title: "Open a Store — PB Bazaar" },
    { name: "description", content: "Apply to open an independent or official brand store on PB Bazaar." },
    { property: "og:title", content: "Open a Store on PB Bazaar" },
    { property: "og:description", content: "Apply for an independent or official brand storefront on PullBid Live." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ApplyPage,
});

const STATUS_LABEL: Record<string, string> = { draft: "Draft", pending_review: "Under review", active: "Live", rejected: "Not approved", suspended: "Suspended", closed: "Closed" };

function ApplyPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mine = useQuery({
    queryKey: ["bazaar", "my-stores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bazaar_stores").select("id, slug, name, store_type, status, review_notes").eq("owner_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [form, setForm] = useState({ name: "", slug: "", store_type: "independent" as "independent" | "brand", category: "", description: "", application_notes: "", shipping_policy: "", return_policy: "", processing_days: "2" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v, ...(k === "name" && (!f.slug || f.slug === slugifyStoreName(f.name)) ? { slug: slugifyStoreName(v) } : {}) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!isValidStoreSlug(form.slug)) { toast.error("Store link must be 3–48 lowercase letters, numbers or dashes."); return; }
    if (form.store_type === "brand" && !form.application_notes.trim()) { toast.error("Brand stores must describe proof of ownership or authorization."); return; }
    setBusy(true);
    const { error } = await supabase.from("bazaar_stores").insert({
      owner_id: user.id, name: form.name.trim(), slug: form.slug, store_type: form.store_type, category: form.category || null,
      description: form.description.trim() || null, application_notes: form.application_notes.trim() || null,
      shipping_policy: form.shipping_policy.trim() || null, return_policy: form.return_policy.trim() || null,
      processing_days: Number(form.processing_days) || null, status: "pending_review",
    });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "That store link is already taken." : error.message); return; }
    toast.success("Application submitted for review");
    qc.invalidateQueries({ queryKey: ["bazaar", "my-stores"] });
    setForm((f) => ({ ...f, name: "", slug: "", description: "", application_notes: "" }));
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-5 px-3 py-4 sm:px-4">
        <div>
          <h1 className="text-2xl font-black">Open a PB Bazaar store</h1>
          <p className="text-sm text-muted-foreground">Applications are reviewed by PullBid before your store goes public.</p>
        </div>
        {!user ? (
          <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
            <p className="text-sm">Sign in to apply for a store.</p>
            <Link to="/auth" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Sign in</Link>
          </div>
        ) : (
          <>
            {!!mine.data?.length && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
                <div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">Your stores</p><Link to="/bazaar/dashboard" className="text-sm font-semibold text-primary">Store dashboard</Link></div>
                <ul className="space-y-2">{mine.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{s.name} <span className="text-muted-foreground">/{s.slug}</span></span>
                    {s.status === "active" ? <Link to="/bazaar/stores/$slug" params={{ slug: s.slug }} className="font-semibold text-primary">View</Link> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS_LABEL[s.status] ?? s.status}</span>}
                  </li>
                ))}</ul>
              </div>
            )}
            <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="grid grid-cols-2 gap-2">
                {(["independent", "brand"] as const).map((t) => (
                  <button type="button" key={t} onClick={() => setForm((f) => ({ ...f, store_type: t }))} className={`rounded-xl p-3 text-left text-sm ring-1 ${form.store_type === t ? "bg-primary/10 ring-primary" : "ring-border"}`}>
                    <p className="font-bold">{t === "brand" ? "Official brand" : "Independent business"}</p>
                    <p className="text-xs text-muted-foreground">{t === "brand" ? "You own or represent the brand" : "Entrepreneurs and small shops"}</p>
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold">Store name<Input required minLength={2} maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" /></label>
              <label className="block text-sm font-semibold">Store link<div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">/bazaar/stores/<Input required value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></div></label>
              <label className="block text-sm font-semibold">Category
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Choose…</option>{BAZAAR_DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Description<Textarea maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} className="mt-1" /></label>
              <label className="block text-sm font-semibold">{form.store_type === "brand" ? "Proof of brand ownership or authorization" : "Business details (optional)"}<Textarea maxLength={4000} value={form.application_notes} onChange={(e) => set("application_notes", e.target.value)} className="mt-1" placeholder={form.store_type === "brand" ? "Trademark, website, distributor letter…" : "Business name, website, what you sell…"} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold">Ships within (days)<Input type="number" min={0} max={60} value={form.processing_days} onChange={(e) => set("processing_days", e.target.value)} className="mt-1" /></label>
                <label className="block text-sm font-semibold sm:col-span-2">Shipping policy<Input value={form.shipping_policy} onChange={(e) => set("shipping_policy", e.target.value)} className="mt-1" /></label>
              </div>
              <label className="block text-sm font-semibold">Return policy<Input value={form.return_policy} onChange={(e) => set("return_policy", e.target.value)} className="mt-1" /></label>
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit for review"}</Button>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
