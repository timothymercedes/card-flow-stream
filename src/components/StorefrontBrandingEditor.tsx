import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

const ACCENT_PRESETS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6"];

type Social = { twitter?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string };

export function StorefrontBrandingEditor() {
  const { user, profile } = useAuth();
  const p = profile as any;
  const [bio, setBio] = useState<string>(p?.bio || "");
  const [bannerUrl, setBannerUrl] = useState<string>(p?.banner_url || "");
  const [accent, setAccent] = useState<string>(p?.accent_color || "#6366f1");
  const [social, setSocial] = useState<Social>((p?.social_links as Social) || {});
  const [featuredText, setFeaturedText] = useState<string>(((p?.featured_listing_ids as string[]) || []).join(", "));
  const [myListings, setMyListings] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("listings")
        .select("id, title, image_url")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40);
      setMyListings(data || []);
    })();
  }, [user?.id]);

  async function uploadBanner(file: File) {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/banner-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("listings").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const { data } = supabase.storage.from("listings").getPublicUrl(path);
    setBannerUrl(data.publicUrl);
    setUploading(false);
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    const featured = featuredText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    const { error } = await (supabase.from("profiles") as any)
      .update({
        bio: bio.slice(0, 280) || null,
        banner_url: bannerUrl || null,
        accent_color: accent || null,
        social_links: social,
        featured_listing_ids: featured,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Storefront updated");
  }

  function setSocialField(key: keyof Social, v: string) {
    setSocial((s) => ({ ...s, [key]: v }));
  }

  return (
    <div className="rounded-xl bg-card p-4 space-y-5">
      <div>
        <p className="text-sm font-bold">Storefront branding</p>
        <p className="text-xs text-muted-foreground">Customize your public store at /store/{p?.username || "username"}.</p>
      </div>

      {/* Banner */}
      <div className="space-y-2">
        <label className="text-xs font-bold">Banner</label>
        <div className="aspect-[3/1] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          {bannerUrl ? (
            <img src={bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No banner</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold hover:bg-muted/70">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
          </label>
          {bannerUrl && (
            <button type="button" onClick={() => setBannerUrl("")} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold">
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Bio */}
      <div className="space-y-1">
        <label className="text-xs font-bold">PB Store bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="What you sell, your specialties, return policy highlights…"
          className="w-full rounded-lg bg-input px-3 py-2 text-sm"
        />
        <p className="text-[10px] text-muted-foreground">{bio.length}/280</p>
      </div>

      {/* Accent */}
      <div className="space-y-2">
        <label className="text-xs font-bold">Accent color</label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAccent(c)}
              style={{ background: c }}
              className={`h-8 w-8 rounded-full ring-2 ${accent === c ? "ring-foreground" : "ring-transparent"}`}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded bg-transparent"
          />
        </div>
      </div>

      {/* Social */}
      <div className="space-y-2">
        <label className="text-xs font-bold">Social links</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["website", "instagram", "twitter", "tiktok", "youtube"] as (keyof Social)[]).map((k) => (
            <input
              key={k}
              value={social[k] || ""}
              onChange={(e) => setSocialField(k, e.target.value)}
              placeholder={k === "website" ? "https://yoursite.com" : `${k} URL or handle`}
              className="rounded-lg bg-input px-3 py-2 text-xs"
            />
          ))}
        </div>
      </div>

      {/* Featured */}
      <div className="space-y-2">
        <label className="text-xs font-bold">Featured items (up to 6)</label>
        <p className="text-[10px] text-muted-foreground">Tap your listings to feature them at the top of your storefront.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {myListings.map((l) => {
            const ids = featuredText.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
            const on = ids.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  let next = ids.filter((x) => x !== l.id);
                  if (!on) {
                    if (next.length >= 6) return toast.error("Max 6 featured items");
                    next = [...next, l.id];
                  }
                  setFeaturedText(next.join(", "));
                }}
                className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on ? "ring-primary" : "ring-transparent"}`}
                title={l.title}
              >
                {l.image_url ? (
                  <img src={l.image_url} alt={l.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-[10px]">{l.title?.slice(0, 14)}</div>
                )}
                {on && <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">★</span>}
              </button>
            );
          })}
          {myListings.length === 0 && <p className="col-span-full text-xs text-muted-foreground">You have no listings yet.</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
          {busy ? "Saving…" : "Save storefront"}
        </button>
      </div>
    </div>
  );
}
