import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitClaim } from "@/lib/insurance.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";

interface Props {
  orderId: string;
  maxCoverageCents: number;
  onSubmitted?: () => void;
  onClose?: () => void;
}

export function ClaimForm({ orderId, maxCoverageCents, onSubmitted, onClose }: Props) {
  const { user } = useAuth();
  const submit = useServerFn(submitClaim);
  const [reason, setReason] = useState<"lost" | "damaged" | "stolen">("damaged");
  const [amount, setAmount] = useState((maxCoverageCents / 100).toFixed(2));
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Array<{ filePath: string; kind: "photo" | "document"; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return;
    setUploading(true);
    try {
      const uploads: typeof files = [];
      for (const file of Array.from(e.target.files)) {
        const path = `${user.id}/${orderId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("insurance-evidence").upload(path, file);
        if (error) throw error;
        uploads.push({
          filePath: path,
          kind: file.type.startsWith("image/") ? "photo" : "document",
          name: file.name,
        });
      }
      setFiles((prev) => [...prev, ...uploads]);
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (cents <= 0) return toast.error("Enter a valid claim amount");
    setSubmitting(true);
    try {
      await submit({
        data: {
          orderId,
          reason,
          amountCents: cents,
          description,
          evidence: files.map((f) => ({ filePath: f.filePath, kind: f.kind })),
        },
      });
      toast.success("Claim submitted");
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit claim");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">File an insurance claim</h3>
        {onClose && (
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold">Reason</label>
        <div className="grid grid-cols-3 gap-2">
          {(["lost", "damaged", "stolen"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-bold capitalize ${
                reason === r ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold">Claim amount (USD)</label>
        <input
          type="number" step="0.01" min="0" max={(maxCoverageCents / 100).toString()}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Max coverage ${(maxCoverageCents / 100).toFixed(2)}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold">What happened</label>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)}
          rows={3} placeholder="Describe the issue..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold">Evidence (photos, receipts, tracking)</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload files
          <input type="file" multiple accept="image/*,application/pdf" onChange={handleUpload} className="hidden" />
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {files.map((f, i) => <li key={i}>• {f.name}</li>)}
          </ul>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit claim
      </button>
    </div>
  );
}
