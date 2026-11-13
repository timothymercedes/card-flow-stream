import { createFileRoute, Link } from "@tanstack/react-router";
import { BazaarImage } from "@/components/bazaar/BazaarImage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductEditor } from "@/components/bazaar/ProductEditor";
import { formatCents, lowestPriceCents } from "@/lib/bazaar";
import { Package, Plus, Store, Settings, Users } from "lucide-react";

export const Route = createFileRoute("/bazaar/dashboard")({
  validateSearch: zodValidator(z.object({ store: z.string().optional(), tab: z.enum(["products", "profile", "team"]).optional() })),
  head: () => ({ meta: [
    { title: "Store Dashboard — PB Bazaar" },
    { name: "description", content: "Manage your PB Bazaar store, products, inventory and team." },
    { property: "og:title", content: "Store Dashboard — PB Bazaar" },
    { property: "og:description", content: "Manage products, photos, options and stock for your PB Bazaar store." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

const STATUS: Record<string, string> = { draft: "Draft", pending_review: "Under review", active: "Live", rejected: "Not approved", suspended: "Suspended", closed: "Closed" };

function Dashboard() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const stores = useQuery({ queryKey: ["bazaar", "dash-stores", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_stores").select("id, slug, name, status, store_type, owner_id, description, logo_url, cover_url, shipping_policy, return_policy, processing_days, review_notes").order("created_at");
    if (error) throw error;
    return (data ?? []);
  } });
  const myStores = stores.data ?? [];
  const store = myStores.find((s) => s.id === search.store) ?? myStores[0];
  const tab = search.tab ?? "products";

  const products = useQuery({ queryKey: ["bazaar", "dash-products", store?.id], enabled: !!store, queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_products").select("id, title, status, images, bazaar_product_variants(price_cents, quantity, is_active)").eq("store_id", store!.id).order("updated_at", { ascending: false });
    if (error) throw error; return data ?? [];
  } });

  if (!user) return <AppShell><div className="p-6 text-center text-sm">Sign in to manage your store. <Link to="/auth" className="font-semibold text-primary">Sign in</Link></div></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-black"><Store className="h-6 w-6 text-primary" /> Store dashboard</h1>
          <Link to="/bazaar/apply" className="text-sm font-semibold text-primary">Apply for another store</Link>
        </div>
        {stores.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !store ? (
          <div className="rounded-2xl bg-card p-6 text-center ring-1 ring-border">
            <p className="text-sm">You don't manage any Bazaar stores yet.</p>
            <Link to="/bazaar/apply" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Open a store</Link>
          </div>
        ) : (
          <>
            {myStores.length > 1 && (
              <select value={store.id} onChange={(e) => nav({ search: (p) => ({ ...p, store: e.target.value }) })} className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Choose store">
                {myStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="font-bold">{store.name}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS[store.status] ?? store.status}</span>
              {store.status === "active" && <Link to="/bazaar/stores/$slug" params={{ slug: store.slug }} className="ml-auto text-sm font-semibold text-primary">View public store</Link>}
              {store.status !== "active" && <p className="w-full text-xs text-muted-foreground">You can prepare products now. Customers will see them once PullBid approves your store.{store.review_notes ? ` Review note: ${store.review_notes}` : ""}</p>}
            </div>
            <div className="flex gap-2">
              {([["products", "Products", Package], ["profile", "Store profile", Settings], ["team", "Team", Users]] as const).map(([k, l, Icon]) => (
                <button key={k} onClick={() => nav({ search: (p) => ({ ...p, tab: k }) })} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tab === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{l}</button>
              ))}
            </div>

            {tab === "products" && (
              <div className="space-y-3">
                <Button onClick={() => setEditing({ open: true, id: null })}><Plus className="mr-1 h-4 w-4" /> Add product</Button>
                {products.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p> : !products.data?.length ? (
                  <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">No products yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">{products.data.map((p) => {
                    const price = lowestPriceCents(p.bazaar_product_variants ?? []);
                    const stock = (p.bazaar_product_variants ?? []).reduce((n, v) => n + (v.is_active ? v.quantity : 0), 0);
                    return (
                      <li key={p.id}><button onClick={() => setEditing({ open: true, id: p.id })} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">{p.images[0] && <BazaarImage src={p.images[0]} alt="" className="h-full w-full object-cover" />}</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.title}</p><p className="text-xs text-muted-foreground">{price !== null ? formatCents(price) : "No price"} · {stock} in stock</p></div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.status}</span>
                      </button></li>
                    );
                  })}</ul>
                )}
              </div>
            )}
            {tab === "profile" && <ProfileForm store={store} onSaved={() => qc.invalidateQueries({ queryKey: ["bazaar"] })} />}
            {tab === "team" && <TeamPanel storeId={store.id} canManage={store.owner_id === user.id} />}
            <ProductEditor storeId={store.id} productId={editing.id} open={editing.open} onClose={() => setEditing({ open: false, id: null })} onSaved={() => qc.invalidateQueries({ queryKey: ["bazaar"] })} />
          </>
        )}
      </div>
    </AppShell>
  );
}

type StoreRow = { id: string; status: string; description: string | null; logo_url: string | null; cover_url: string | null; shipping_policy: string | null; return_policy: string | null; processing_days: number | null };

function ProfileForm({ store, onSaved }: { store: StoreRow; onSaved: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({ description: store.description ?? "", logo_url: store.logo_url ?? "", cover_url: store.cover_url ?? "", shipping_policy: store.shipping_policy ?? "", return_policy: store.return_policy ?? "", processing_days: String(store.processing_days ?? "") });
  async function up(file: File | undefined, key: "logo_url" | "cover_url") {
    if (!file || !user) return;
    const path = `${store.id}/${user.id}/${key}-${crypto.randomUUID()}.${file.name.split(".").pop() || "jpg"}`;
    const { error } = await supabase.storage.from("bazaar-media").upload(path, file, { contentType: file.type });
    if (error) return toast.error(error.message);
    setF((x) => ({ ...x, [key]: path }));
  }
  async function save() {
    const { error } = await supabase.from("bazaar_stores").update({ description: f.description || null, logo_url: f.logo_url || null, cover_url: f.cover_url || null, shipping_policy: f.shipping_policy || null, return_policy: f.return_policy || null, processing_days: f.processing_days === "" ? null : Number(f.processing_days) }).eq("id", store.id);
    if (error) return toast.error(error.message);
    toast.success("Store updated"); onSaved();
  }
  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-semibold">Logo<input type="file" accept="image/*" className="mt-1 block text-xs" onChange={(e) => up(e.target.files?.[0], "logo_url")} />{f.logo_url && <BazaarImage src={f.logo_url} alt="" className="mt-2 h-16 w-16 rounded-xl object-cover" />}</label>
        <label className="text-sm font-semibold">Banner<input type="file" accept="image/*" className="mt-1 block text-xs" onChange={(e) => up(e.target.files?.[0], "cover_url")} />{f.cover_url && <BazaarImage src={f.cover_url} alt="" className="mt-2 h-16 w-40 rounded-xl object-cover" />}</label>
      </div>
      <Textarea placeholder="Store description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <Input placeholder="Shipping policy" value={f.shipping_policy} onChange={(e) => setF({ ...f, shipping_policy: e.target.value })} />
      <Input placeholder="Return policy" value={f.return_policy} onChange={(e) => setF({ ...f, return_policy: e.target.value })} />
      <Input type="number" min={0} max={60} placeholder="Ships within (days)" value={f.processing_days} onChange={(e) => setF({ ...f, processing_days: e.target.value })} />
      <Button onClick={save}>Save store profile</Button>
    </div>
  );
}

function TeamPanel({ storeId, canManage }: { storeId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("catalog");
  const team = useQuery({ queryKey: ["bazaar", "team", storeId], queryFn: async () => {
    const { data, error } = await supabase.from("bazaar_store_members").select("id, user_id, role").eq("store_id", storeId);
    if (error) throw error; return data ?? [];
  } });
  async function add() {
    const { data: prof } = await supabase.from("profiles").select("id").eq("username", username.trim().replace(/^@/, "")).maybeSingle();
    if (!prof) return toast.error("No user with that username");
    const { error } = await supabase.from("bazaar_store_members").insert({ store_id: storeId, user_id: prof.id, role });
    if (error) return toast.error(error.code === "23505" ? "Already on the team" : error.message);
    toast.success("Team member added"); setUsername(""); qc.invalidateQueries({ queryKey: ["bazaar", "team", storeId] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("bazaar_store_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["bazaar", "team", storeId] });
  }
  const ROLE: Record<string, string> = { owner: "Owner", admin: "Store admin", catalog: "Catalog manager", fulfillment: "Orders & shipping", viewer: "Read-only" };
  return (
    <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <ul className="space-y-1 text-sm">
        <li className="text-muted-foreground">You (owner)</li>
        {(team.data ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between"><span className="truncate font-mono text-xs">{m.user_id.slice(0, 8)}… · {ROLE[m.role]}</span>{canManage && <button className="text-xs text-destructive" onClick={() => remove(m.id)}>Remove</button>}</li>
        ))}
      </ul>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Role">
            {["admin", "catalog", "fulfillment", "viewer"].map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
          </select>
          <Button onClick={add} disabled={!username.trim()}>Add</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Only the store owner can change the team.</p>}
    </div>
  );
}
