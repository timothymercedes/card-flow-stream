import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, Eye, Heart, Send, MoreHorizontal, Trash2, Star, Flag, Ban, Pause } from "lucide-react";
import { toast } from "sonner";
import { STORY_REACTIONS, IMAGE_SECONDS, type Story } from "@/lib/stories";

type Props = {
  groups: Story[][];
  start: { group: number; index: number };
  onClose: () => void;
  onChanged?: () => void;
  onSeen?: (id: string) => void;
};
type P = { id: string; username: string; avatar_url: string | null };

export function StoryViewer({ groups, start, onClose, onChanged, onSeen }: Props) {
  const { user } = useAuth();
  const [pos, setPos] = useState(start);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState<"viewers" | "reactions" | "highlight" | null>(null);
  const [mine, setMine] = useState<string | undefined>();
  const [rows, setRows] = useState<{ user_id: string; reaction: string }[]>([]);
  const [viewers, setViewers] = useState<{ viewer_id: string; viewed_at: string }[]>([]);
  const [people, setPeople] = useState<Record<string, P>>({});
  const [highlights, setHighlights] = useState<{ id: string; title: string }[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number; t: number; timer?: number } | null>(null);
  const group = groups[pos.group] || [];
  const s = group[pos.index];
  const isMine = !!s && user?.id === s.user_id;
  const holding = paused || menu || !!drawer || reply.length > 0;

  function next() {
    if (pos.index < group.length - 1) setPos({ group: pos.group, index: pos.index + 1 });
    else if (pos.group < groups.length - 1) setPos({ group: pos.group + 1, index: 0 });
    else onClose();
  }
  function prev() {
    if (pos.index > 0) setPos({ group: pos.group, index: pos.index - 1 });
    else if (pos.group > 0) setPos({ group: pos.group - 1, index: 0 });
    else setProgress(0);
  }
  function jumpGroup(d: 1 | -1) {
    const g = pos.group + d;
    if (g < 0) return; if (g >= groups.length) return onClose();
    setPos({ group: g, index: 0 });
  }

  // reset per story, record view, load insights
  useEffect(() => {
    setProgress(0); setMenu(false); setDrawer(null); setReply("");
    if (!s) return;
    onSeen?.(s.id);
    if (user && !isMine) {
      supabase.from("story_views").upsert([{ story_id: s.id, viewer_id: user.id, viewed_at: new Date().toISOString() }], { onConflict: "story_id,viewer_id" }).then(() => {});
    }
    void loadReactions();
    if (isMine) void loadViewers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, user?.id]);

  // image timer (videos advance on end)
  useEffect(() => {
    if (!s || s.media_type === "video" || holding) return;
    const t = window.setInterval(() => setProgress((p) => {
      const n = p + 0.1 / IMAGE_SECONDS;
      if (n >= 1) { window.clearInterval(t); setTimeout(next, 0); return 1; }
      return n;
    }), 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, holding]);
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    if (holding) v.pause(); else v.play().catch(() => {});
  }, [holding, s?.id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (drawer || document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  });

  async function people_(ids: string[]) {
    const miss = [...new Set(ids)].filter((id) => !people[id]);
    if (!miss.length) return;
    const { data } = await supabase.from("profiles").select("id,username,avatar_url").in("id", miss);
    setPeople((m) => { const n = { ...m }; (data || []).forEach((p: any) => { n[p.id] = p; }); return n; });
  }
  async function loadReactions() {
    if (!s) return;
    const { data } = await supabase.from("story_reactions").select("user_id,reaction").eq("story_id", s.id);
    const r = (data || []) as { user_id: string; reaction: string }[];
    setRows(r); setMine(r.find((x) => x.user_id === user?.id)?.reaction);
    if (isMine) void people_(r.map((x) => x.user_id));
  }
  async function loadViewers() {
    if (!s) return;
    const { data } = await supabase.from("story_views").select("viewer_id,viewed_at").eq("story_id", s.id).order("viewed_at", { ascending: false });
    setViewers((data || []) as any); void people_((data || []).map((v: any) => v.viewer_id));
  }
  async function react(key: string) {
    if (!user || !s) return toast.error("Sign in to react");
    const q = supabase.from("story_reactions");
    const { error } = mine === key
      ? await q.delete().eq("story_id", s.id).eq("user_id", user.id)
      : mine
        ? await q.update({ reaction: key }).eq("story_id", s.id).eq("user_id", user.id)
        : await q.insert({ story_id: s.id, user_id: user.id, reaction: key });
    if (error) return toast.error(error.message);
    void loadReactions();
  }
  async function sendReply() {
    if (!s || !reply.trim()) return;
    if (!user) return toast.error("Sign in to reply");
    const { error } = await supabase.rpc("reply_to_story", { _story_id: s.id, _message: reply.trim() });
    if (error) return toast.error(error.message);
    setReply(""); toast.success("Reply sent privately");
  }
  async function remove() {
    if (!s || !confirm("Delete this story?")) return;
    const { error } = await supabase.rpc("soft_delete_story", { _story_id: s.id });
    if (error) return toast.error(error.message);
    toast.success("Story deleted"); onChanged?.(); onClose();
  }
  async function report() {
    if (!s || !user) return toast.error("Sign in to report");
    const why = prompt("Why are you reporting this story?");
    if (!why?.trim()) return;
    const { error } = await supabase.from("moderation_reports").insert({ reporter_id: user.id, subject_user_id: s.user_id, subject_type: "user", subject_ref_id: s.id, category: "story", description: why.trim().slice(0, 1000) });
    if (error) return toast.error(error.message);
    setMenu(false); toast.success("Report sent to moderators");
  }
  async function block() {
    if (!s || !user) return toast.error("Sign in to block");
    if (!confirm(`Block @${s.username}? You won't see each other's stories.`)) return;
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: s.user_id });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    toast.success(`@${s.username} blocked`); onChanged?.(); onClose();
  }
  async function openHighlight() {
    if (!user) return;
    setDrawer("highlight");
    const { data } = await supabase.from("story_highlights").select("id,title").eq("user_id", user.id).order("position");
    setHighlights(data || []);
  }
  async function addTo(hid: string | null) {
    if (!s || !user) return;
    let id = hid;
    if (!id) {
      const t = newTitle.trim(); if (!t) return;
      const { data, error } = await supabase.from("story_highlights").insert({ user_id: user.id, title: t.slice(0, 30), cover_story_id: s.id, position: highlights.length }).select("id").single();
      if (error) return toast.error(error.message);
      id = data.id;
    }
    const { error } = await supabase.from("story_highlight_items").upsert({ highlight_id: id!, story_id: s.id }, { onConflict: "highlight_id,story_id" });
    if (error) return toast.error(error.message);
    toast.success("Saved to highlight"); setNewTitle(""); setDrawer(null); onChanged?.();
  }

  function down(e: React.PointerEvent) {
    press.current = { x: e.clientX, y: e.clientY, t: Date.now(), timer: window.setTimeout(() => setPaused(true), 220) };
  }
  function up(e: React.PointerEvent) {
    const p = press.current; press.current = null; if (!p) return;
    window.clearTimeout(p.timer);
    const dx = e.clientX - p.x, dy = e.clientY - p.y, long = Date.now() - p.t > 220;
    setPaused(false);
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return jumpGroup(dx < 0 ? 1 : -1);
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (long) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.33) prev(); else next();
  }

  if (!s) return null;
  const counts = rows.reduce<Record<string, number>>((a, r) => { a[r.reaction] = (a[r.reaction] || 0) + 1; return a; }, {});
  const pill = "rounded-full bg-black/55 text-white backdrop-blur";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black" role="dialog" aria-label={`Story by @${s.username}`}>
      <div className="relative h-[100dvh] w-full max-w-md select-none overflow-hidden bg-black sm:h-[92dvh] sm:rounded-2xl" onContextMenu={(e) => e.preventDefault()}>
        {/* media */}
        <div className="absolute inset-0 touch-none" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { press.current = null; setPaused(false); }} data-testid="story-stage">
          {s.media_type === "video" ? (
            <video key={s.id} ref={videoRef} src={s.image_url} autoPlay playsInline controlsList="nodownload noplaybackrate" disablePictureInPicture
              className="pointer-events-none h-full w-full object-contain"
              onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(Math.min(1, v.currentTime / Math.min(v.duration, 60))); if (v.currentTime >= 60) next(); }}
              onEnded={next} />
          ) : (
            <img key={s.id} src={s.image_url} alt={s.caption || `Story by @${s.username}`} draggable={false} className="pointer-events-none h-full w-full object-contain" />
          )}
          {s.overlays.map((o, i) => (
            <span key={i} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${o.kind === "sticker" ? "text-5xl drop-shadow" : "max-w-[85%] rounded-lg bg-black/55 px-3 py-1.5 text-center text-lg font-bold text-white"}`} style={{ left: `${o.x}%`, top: `${o.y}%` }}>{o.value}</span>
          ))}
        </div>

        {/* progress */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex gap-1">
          {group.map((g, i) => (
            <div key={g.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/30">
              <div className="h-full bg-white" style={{ width: `${i < pos.index ? 100 : i === pos.index ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute inset-x-2 top-5 z-30 flex items-center gap-2">
          <Link to="/@{$username}" params={{ username: s.username }} onClick={onClose} className={`flex items-center gap-2 p-1 pr-3 ${pill}`}>
            <span className="h-8 w-8 overflow-hidden rounded-full bg-muted">{s.avatar_url ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs font-bold">{s.username[0]?.toUpperCase()}</span>}</span>
            <span className="text-left leading-tight"><span className="block text-sm font-bold">@{s.username}</span><span className="block text-[10px] opacity-75">{timeAgo(s.created_at)} · {pos.index + 1}/{group.length}{groups.length > 1 ? ` · ${groups.length - pos.group - 1} more` : ""}</span></span>
          </Link>
          {paused && <Pause className="h-4 w-4 text-white" aria-label="Paused" />}
          <div className="ml-auto flex gap-1">
            <button aria-label="Story options" onClick={() => setMenu((m) => !m)} className={`p-2 ${pill}`}><MoreHorizontal className="h-4 w-4" /></button>
            <button aria-label="Close story" onClick={onClose} className={`p-2 ${pill}`}><X className="h-4 w-4" /></button>
          </div>
        </div>

        {menu && (
          <div className="absolute right-2 top-16 z-40 w-48 overflow-hidden rounded-xl bg-card text-sm text-card-foreground shadow-xl">
            {isMine ? (<>
              <button onClick={openHighlight} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-muted"><Star className="h-4 w-4" />Add to highlight</button>
              <button onClick={remove} className="flex w-full items-center gap-2 px-3 py-2.5 text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" />Delete story</button>
            </>) : (<>
              <button onClick={report} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-muted"><Flag className="h-4 w-4" />Report story</button>
              <button onClick={block} className="flex w-full items-center gap-2 px-3 py-2.5 text-destructive hover:bg-muted"><Ban className="h-4 w-4" />Block @{s.username}</button>
            </>)}
          </div>
        )}

        {s.caption && <div className="pointer-events-none absolute inset-x-3 bottom-32 z-10 rounded-lg bg-black/55 p-2 text-sm text-white">{s.caption}</div>}

        {/* footer */}
        <div className="absolute inset-x-2 bottom-3 z-30 space-y-2">
          {isMine ? (
            <div className="flex gap-2">
              <button onClick={() => setDrawer("viewers")} className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold ${pill}`}><Eye className="h-3.5 w-3.5" />{viewers.length} {viewers.length === 1 ? "viewer" : "viewers"}</button>
              <button onClick={() => setDrawer("reactions")} className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold ${pill}`}><Heart className="h-3.5 w-3.5" />{rows.length} reactions</button>
            </div>
          ) : (<>
            <div className={`flex justify-center gap-1 p-1 ${pill}`}>
              {STORY_REACTIONS.map((r) => (
                <button key={r.key} aria-label={`React ${r.emoji}`} aria-pressed={mine === r.key} onClick={() => react(r.key)} className={`h-9 w-9 rounded-full text-xl active:scale-90 ${mine === r.key ? "bg-white/25" : ""}`}>{r.emoji}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void sendReply(); }} className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} placeholder={user ? `Reply to @${s.username}…` : "Sign in to reply"} disabled={!user} aria-label="Reply privately" className="min-w-0 flex-1 rounded-full border border-white/40 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/60 outline-none" />
              <button type="submit" disabled={!reply.trim()} aria-label="Send reply" className={`p-2.5 disabled:opacity-40 ${pill}`}><Send className="h-4 w-4" /></button>
            </form>
          </>)}
        </div>

        {drawer && (
          <div className="absolute inset-x-0 bottom-0 z-50 max-h-[65%] overflow-y-auto rounded-t-2xl bg-card p-4 text-card-foreground">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">{drawer === "viewers" ? `Viewers (${viewers.length})` : drawer === "reactions" ? `Reactions (${rows.length})` : "Add to highlight"}</p>
              <button aria-label="Close" onClick={() => setDrawer(null)}><X className="h-4 w-4" /></button>
            </div>
            {drawer === "reactions" && <div className="mb-3 flex flex-wrap gap-1.5">{STORY_REACTIONS.filter((r) => counts[r.key]).map((r) => <span key={r.key} className="rounded-full bg-muted px-2 py-1 text-xs">{r.emoji} {counts[r.key]}</span>)}</div>}
            {drawer === "highlight" ? (
              <div className="space-y-2">
                {highlights.map((h) => <button key={h.id} onClick={() => addTo(h.id)} className="block w-full rounded-lg bg-muted px-3 py-2 text-left text-sm">{h.title}</button>)}
                <form onSubmit={(e) => { e.preventDefault(); void addTo(null); }} className="flex gap-2">
                  <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={30} placeholder="New highlight name" className="min-w-0 flex-1 rounded-lg bg-input px-3 py-2 text-sm outline-none" />
                  <button className="rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground">Create</button>
                </form>
              </div>
            ) : (
              <ul className="space-y-1">
                {(drawer === "viewers" ? viewers.map((v) => ({ id: v.viewer_id, tail: timeAgo(v.viewed_at) })) : rows.map((r) => ({ id: r.user_id, tail: STORY_REACTIONS.find((x) => x.key === r.reaction)?.emoji || "" }))).map((x) => (
                  <li key={x.id}><Link to="/@{$username}" params={{ username: people[x.id]?.username || "" }} onClick={onClose} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted">
                    <span className="h-8 w-8 overflow-hidden rounded-full bg-muted">{people[x.id]?.avatar_url && <img src={people[x.id]!.avatar_url!} alt="" className="h-full w-full object-cover" />}</span>
                    <span className="flex-1 truncate text-sm">@{people[x.id]?.username || "member"}</span><span className="text-xs text-muted-foreground">{x.tail}</span>
                  </Link></li>
                ))}
                {(drawer === "viewers" ? viewers : rows).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nobody yet</p>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function timeAgo(iso: string) {
  const m = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
