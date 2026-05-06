import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Sparkles, Lock, Globe, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { StreamCategoryPicker } from "@/components/StreamCategoryPicker";
import type { TcgTag } from "@/lib/streamTaxonomy";
import { tcgTagMeta } from "@/lib/streamTaxonomy";

export const Route = createFileRoute("/showoff")({
  head: () => ({ meta: [{ title: "Show Off — PullBid Live" }] }),
  component: ShowOff,
});

type ShowStream = {
  id: string;
  seller_id: string;
  title: string;
  thumbnail_url: string | null;
  is_private: boolean;
};

function ShowOff() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [tagQ, setTagQ] = useState("");
  const [tagRes, setTagRes] = useState<any[]>([]);
  const [tagged, setTagged] = useState<{ id: string; username: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [streams, setStreams] = useState<ShowStream[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) { setVerified(false); return; }
    supabase.from("profiles").select("live_verified").eq("id", user.id).maybeSingle()
      .then(({ data }) => setVerified(!!(data as any)?.live_verified));
    supabase.from("live_streams").select("id, seller_id, title, thumbnail_url, is_private")
      .eq("status", "live").eq("mode", "show_off").order("created_at", { ascending: false })
      .then(({ data }) => setStreams((data as any[]) || []));
  }, [user]);

  async function searchUsers(q: string) {
    setTagQ(q);
    if (!q.trim()) return setTagRes([]);
    const { data } = await supabase.rpc("search_public_profiles", { _query: q.trim(), _limit: 8 });
    setTagRes(((data as any[]) || []).filter((u) => u.id !== user?.id && !tagged.find((t) => t.id === u.id)));
  }

  async function startShowOff(tcgTags?: TcgTag[]) {
    if (!user || !profile) return toast.error("Sign in first");
    if (!title.trim()) return toast.error("Add a title");
    if (!verified) return toast.error("Get verified by an admin to host live");
    if (!tcgTags || tcgTags.length === 0) { setPickerOpen(true); return; }
    setBusy(true);
    const { data, error } = await supabase.from("live_streams").insert({
      seller_id: user.id,
      title: title.trim(),
      mode: "show_off",
      stream_type: "show_off",
      tcg_tags: tcgTags,
      is_private: isPrivate,
      allow_collab_requests: !isPrivate,
      max_collab_count: 6,
      listing_type: "auction",
      status: "live",
      is_active: true,
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) { setBusy(false); return toast.error(error.message); }

    // Pre-invite tagged users as collab participants
    if (tagged.length) {
      const invites = tagged.map((t) => ({
        stream_id: data.id, host_id: user.id, host_username: profile.username,
        invitee_id: t.id, invitee_username: t.username,
      }));
      await supabase.from("stream_collab_invites").insert(invites);
      await supabase.from("notifications").insert(
        tagged.map((t) => ({
          user_id: t.id, type: "collab_invite",
          body: `✨ @${profile.username} invited you to a Show Off live`,
          link: `/live/${data.id}`,
        }))
      );
    }
    nav({ to: "/live/$id", params: { id: data.id } });
  }

  if (!user) {
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <h1 className="text-xl font-bold">Show Off your collection</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to start a casual show-off live.</p>
          <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-fuchsia-400" />
          <h1 className="text-2xl font-bold">Show Off</h1>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Casual collector hangouts — no selling, just vibes. Talk cards, show pulls, collab with friends.</p>

        {verified === false && (
          <div className="mb-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <p className="font-bold text-amber-300">Verification required</p>
            <p className="mt-1 text-muted-foreground">An admin needs to verify your account before you can host or join Show Off lives. (Gov ID + selfie verification coming soon.)</p>
          </div>
        )}

        <div className="mb-5 space-y-3 rounded-2xl bg-card p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Stream title — e.g. 'Friday night PSA reveal'"
            maxLength={80}
            className="w-full rounded-lg bg-input px-3 py-2.5 text-sm outline-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold ${!isPrivate ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <Globe className="h-3.5 w-3.5" /> Public
            </button>
            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold ${isPrivate ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <Lock className="h-3.5 w-3.5" /> Private
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isPrivate
              ? "Private — only invited friends can watch, chat, or join the video collab."
              : "Public — anyone can watch & chat. Only approved friends can join the video collab."}
          </p>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Invite friends to collab</p>
            <input
              value={tagQ}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Search by username"
              className="w-full rounded-lg bg-input px-3 py-2 text-xs outline-none"
            />
            {tagRes.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border">
                {tagRes.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setTagged([...tagged, { id: u.id, username: u.username }]); setTagQ(""); setTagRes([]); }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span>@{u.username}</span>
                    <UserPlus className="h-3.5 w-3.5 text-primary" />
                  </button>
                ))}
              </div>
            )}
            {tagged.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tagged.map((t) => (
                  <span key={t.id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    @{t.username}
                    <button onClick={() => setTagged(tagged.filter((x) => x.id !== t.id))} className="opacity-60 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => startShowOff()}
            disabled={busy || !title.trim() || !verified}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Starting…" : "🎉 Go Live (Show Off)"}
          </button>
        </div>

        <h2 className="mb-2 text-sm font-bold">Live now</h2>
        {streams.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No Show Off lives right now.</p>}
        <div className="grid grid-cols-2 gap-3">
          {streams.map((s) => (
            <Link key={s.id} to="/live/$id" params={{ id: s.id }}>
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-violet-500/30">
                {s.thumbnail_url && <img src={s.thumbnail_url} className="h-full w-full object-cover" alt={s.title} />}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-2.5 w-2.5" /> SHOW OFF
                </div>
                {s.is_private && (
                  <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                    <Lock className="inline h-2.5 w-2.5" />
                  </div>
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold">{s.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
