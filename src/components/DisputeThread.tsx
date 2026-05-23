import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Send, Paperclip } from "lucide-react";

type Msg = { user_id: string; username: string; role: "reporter" | "reported" | "admin"; body: string; at: string };

interface Props {
  disputeId: string;
  canPost?: boolean;
  /** Optional: allow the parties (not admins) to attach evidence photos. */
  allowEvidence?: boolean;
}

export function DisputeThread({ disputeId, canPost = true, allowEvidence = true }: Props) {
  const { user, profile } = useAuth();
  const [dispute, setDispute] = useState<any | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("disputes")
      .select("id, messages, evidence_urls, status, reporter_id, reported_user_id")
      .eq("id", disputeId)
      .maybeSingle();
    setDispute(data);
  }
  useEffect(() => { load(); }, [disputeId]);

  // Resolve stored entries (storage paths or legacy public URLs) to short-lived signed URLs.
  useEffect(() => {
    const entries: string[] = dispute?.evidence_urls || [];
    if (entries.length === 0) { setSignedUrls({}); return; }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const entry of entries) {
        const m = entry.match(/dispute-evidence\/(.+)$/);
        const path = m ? m[1] : entry;
        const { data } = await supabase.storage
          .from("dispute-evidence")
          .createSignedUrl(path, 60 * 60);
        if (data?.signedUrl) next[entry] = data.signedUrl;
      }
      if (!cancelled) setSignedUrls(next);
    })();
    return () => { cancelled = true; };
  }, [dispute?.evidence_urls]);

  async function send() {
    if (!user || !body.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("append_dispute_message", {
      _dispute_id: disputeId,
      _body: body.trim(),
      _username: profile?.username || "user",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody("");
    load();
  }

  async function uploadEvidence(file: File) {
    if (!user) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Photo must be under 8MB");
    setUploading(true);
    const path = `${user.id}/${disputeId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("dispute-evidence")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    // Store the storage path; display layer resolves a signed URL on demand.
    const next = [...(dispute?.evidence_urls || []), path];
    const { error } = await supabase.from("disputes").update({ evidence_urls: next }).eq("id", disputeId);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Evidence added");
    load();
  }

  if (!dispute) return <p className="text-[11px] text-muted-foreground">Loading thread…</p>;

  const closed = dispute.status === "resolved" || dispute.status === "rejected";

  return (
    <div className="mt-2 space-y-2">
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-muted/30 p-2">
        {(dispute.messages || []).length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground">No messages yet.</p>
        )}
        {(dispute.messages || []).map((m: Msg, i: number) => (
          <div key={i} className={`rounded-lg px-2 py-1.5 text-xs ${
            m.role === "admin" ? "bg-primary/15" : m.user_id === user?.id ? "bg-card ml-6" : "bg-card mr-6"
          }`}>
            <p className="text-[10px] font-semibold text-muted-foreground capitalize">
              {m.username} · {m.role}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground/70">{new Date(m.at).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {dispute.evidence_urls?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {dispute.evidence_urls.map((u: string) => {
            const src = signedUrls[u];
            if (!src) return null;
            return (
              <a key={u} href={src} target="_blank" rel="noreferrer">
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="evidence" className="h-14 w-14 rounded object-cover ring-1 ring-border/60" />
            </a>
          ))}
        </div>
      )}

      {canPost && !closed && (
        <div className="flex items-center gap-1.5">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Reply…"
            className="flex-1 rounded-lg bg-input px-3 py-2 text-xs outline-none"
          />
          {allowEvidence && (user?.id === dispute.reporter_id || user?.id === dispute.reported_user_id) && (
            <label className="cursor-pointer rounded-lg bg-muted px-2 py-2 text-muted-foreground hover:text-foreground" title="Add evidence photo">
              <Paperclip className="h-4 w-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(f); e.target.value = ""; }}
              />
            </label>
          )}
          <button
            onClick={send}
            disabled={busy || !body.trim()}
            className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
