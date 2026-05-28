import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import {
  getUserDossierFn,
  getUserAuditTimelineFn,
  addAdminNoteFn,
} from "@/lib/moderation.functions";
import { AuditTimeline } from "./AuditTimeline";

export function AdminUserDossier({
  userId,
  onClose,
  onOpenUser,
}: {
  userId: string;
  onClose: () => void;
  onOpenUser?: (id: string) => void;
}) {
  const [dossier, setDossier] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [noteSeverity, setNoteSeverity] = useState<"info" | "medium" | "high">("info");
  const [notify, setNotify] = useState(false);
  const getDossier = useServerFn(getUserDossierFn);
  const getTimeline = useServerFn(getUserAuditTimelineFn);
  const addNote = useServerFn(addAdminNoteFn);

  async function refresh() {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        getDossier({ data: { userId } }),
        getTimeline({ data: { userId, limit: 100 } }),
      ]);
      setDossier(d);
      setTimeline(t.rows);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load user");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function submitNote() {
    if (!noteText.trim()) return;
    try {
      await addNote({
        data: {
          subjectUserId: userId,
          note: noteText,
          severity: noteSeverity,
          notifyUser: notify,
        },
      });
      toast.success(notify ? "Warning sent" : "Note added");
      setNoteText("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  if (loading || !dossier) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading dossier…</p>
      </div>
    );
  }

  const p = dossier.profile;
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between sticky top-0 bg-background py-2 z-10">
          <h2 className="text-lg font-bold">User Dossier</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="border rounded-lg p-4 bg-card">
          <div className="flex items-start gap-3">
            {p?.avatar_url && (
              <img src={p.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold">@{p?.username}</h3>
              {p?.shop_name && (
                <p className="text-sm text-muted-foreground">PB Store: {p.shop_name}</p>
              )}
              <p className="text-[10px] font-mono text-muted-foreground mt-1">{userId}</p>
              <div className="flex gap-2 mt-2 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 rounded bg-muted">
                  Roles: {dossier.roles.join(", ") || "user"}
                </span>
                {p?.is_seller && (
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">Seller</span>
                )}
                <span className="px-2 py-0.5 rounded bg-muted">
                  Verification: {p?.verification_status ?? "none"}
                </span>
                <span className="px-2 py-0.5 rounded bg-muted">
                  Stripe: {p?.stripe_onboarding_status ?? "—"}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            <div className="border rounded p-2">
              <div className="text-lg font-bold">{dossier.counts.orders}</div>
              <div className="text-[10px] text-muted-foreground">Orders</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold">{dossier.counts.disputes}</div>
              <div className="text-[10px] text-muted-foreground">Disputes</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold">{dossier.counts.reports}</div>
              <div className="text-[10px] text-muted-foreground">Reports</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold">{dossier.counts.payouts}</div>
              <div className="text-[10px] text-muted-foreground">Payouts</div>
            </div>
          </div>
        </section>

        {dossier.riskScore && (
          <section className="mt-3 border rounded-lg p-3 bg-card">
            <h4 className="font-semibold text-sm">Risk score</h4>
            <p className="text-xs text-muted-foreground">
              Score: <span className="font-bold">{dossier.riskScore.score}</span> · Tier:{" "}
              {dossier.riskScore.tier} ·{" "}
              {dossier.riskScore.under_review ? "Under review" : "OK"}
            </p>
          </section>
        )}

        {dossier.restrictions.length > 0 && (
          <section className="mt-3 border rounded-lg p-3 bg-destructive/5">
            <h4 className="font-semibold text-sm text-destructive">Active restrictions</h4>
            <ul className="text-xs mt-1 space-y-1">
              {dossier.restrictions.map((r: any) => (
                <li key={r.id}>
                  <span className="font-mono">{r.kind}</span> — {r.reason}
                  {r.expires_at && ` (until ${new Date(r.expires_at).toLocaleDateString()})`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {dossier.storeHistory.length > 0 && (
          <section className="mt-3 border rounded-lg p-3 bg-card">
            <h4 className="font-semibold text-sm">Store name history</h4>
            <ul className="text-xs mt-1 space-y-1">
              {dossier.storeHistory.map((h: any, i: number) => (
                <li key={i}>
                  <span className="font-mono">{h.old_name ?? "—"}</span> →{" "}
                  <span className="font-mono font-bold">{h.new_name ?? "—"}</span>
                  <span className="ml-2 text-muted-foreground">
                    {new Date(h.changed_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {dossier.usernameHistory.length > 0 && (
          <section className="mt-3 border rounded-lg p-3 bg-card">
            <h4 className="font-semibold text-sm">Username history</h4>
            <ul className="text-xs mt-1 space-y-1">
              {dossier.usernameHistory.map((h: any, i: number) => (
                <li key={i}>
                  <span className="font-mono">@{h.old_username ?? "—"}</span> →{" "}
                  <span className="font-mono font-bold">@{h.new_username ?? "—"}</span>
                  <span className="ml-2 text-muted-foreground">
                    {new Date(h.changed_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-3 border rounded-lg p-3 bg-card">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add admin note / warning
          </h4>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Note (visible to admins only unless 'notify user' is checked)"
            className="w-full mt-2 px-2 py-1 text-xs border rounded bg-background"
            rows={2}
          />
          <div className="flex items-center gap-2 mt-2 text-xs">
            <select
              value={noteSeverity}
              onChange={(e) => setNoteSeverity(e.target.value as any)}
              className="border rounded px-2 py-1 bg-background"
            >
              <option value="info">Info</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              Notify user (formal warning)
            </label>
            <button
              onClick={submitNote}
              className="ml-auto px-3 py-1 bg-primary text-primary-foreground rounded"
            >
              Save
            </button>
          </div>
        </section>

        <section className="mt-3">
          <h4 className="font-semibold text-sm mb-2">Account timeline</h4>
          <AuditTimeline rows={timeline} onOpenUser={onOpenUser} />
        </section>
      </div>
    </div>
  );
}
