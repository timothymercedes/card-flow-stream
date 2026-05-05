import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
};

/**
 * Small uploader that pushes an image to the public `listing-images` bucket
 * under the user's own folder and returns the public URL. Also keeps the
 * raw URL field editable so power-users can paste a link.
 */
export function ListingImageUpload({ value, onChange, label = "Photo", className }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!user) return toast.error("Sign in to upload");
    if (file.size > 8 * 1024 * 1024) return toast.error("Image must be under 8MB");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…or paste image URL"
          className="min-w-0 flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-lg bg-muted px-2 py-2 text-xs"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {value && (
        <img
          src={value}
          alt="preview"
          className="mt-2 h-24 w-24 rounded-lg object-cover ring-1 ring-border"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
