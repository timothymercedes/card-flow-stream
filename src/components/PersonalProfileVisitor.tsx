import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Gem, Lock, MessageCircle, Sparkles, Pin, Share2, UserPlus, UserCheck, Sun, Moon, Palette, Move } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERSONAL_PROFILE_TABS, type PersonalProfileTab } from '@/lib/personalProfilePreview';
import { loadPersonalVisitor, interactPersonalVisitor } from '@/lib/personalProfileVisitor.functions';

/** Media fetched through the server authorization route only. */
function VisitorMedia({ id, kind, viewer }: { id: string; kind: string; viewer: string | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let blob: string | null = null; let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`/api/personal-media/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
      if (!res.ok || cancelled) return;
      blob = URL.createObjectURL(await res.blob()); setUrl(blob);
    })();
    return () => { cancelled = true; if (blob) URL.revokeObjectURL(blob); };
  }, [id, viewer]);
  if (!url) return <div className="personal-empty" role="status">Loading media…</div>;
  return kind === 'video' ? <video src={url} controls playsInline preload="metadata" className="w-full" aria-label="Story video" /> : <img src={url} alt="Profile photograph" loading="lazy" />;
}

const LABELS: Record<string, string> = { public: 'Public', followers: 'Followers', friends: 'Close friends', only_me: 'Only me' };
export function PersonalProfileVisitor({ username }: { username: string }) {
  const { session } = useAuth();
  const viewer = session?.user.id;
  const load = useServerFn(loadPersonalVisitor), interact = useServerFn(interactPersonalVisitor);
  const client = useQueryClient();
  const key = ['personal-visitor', viewer ?? 'guest', username];
  const q = useInfiniteQuery({ queryKey: key, initialPageParam: 0, queryFn: ({ pageParam }) => load({ data: { username, cursor: pageParam } }), getNextPageParam: last => last.nextCursor ?? undefined, staleTime: 0, retry: false });
  const [tab, setTab] = useState<PersonalProfileTab>('Posts');
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(localStorage.getItem('pb-profile-theme') === 'light'); }, []);
  const [customizing, setCustomizing] = useState(false);
  const [lookPos, setLookPos] = useState<number | null>(null);
  const [lookLayout, setLookLayout] = useState<'classic' | 'centered' | 'compact' | null>(null);
  const [savingLook, setSavingLook] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followDelta, setFollowDelta] = useState(0);
  useEffect(() => { setOpen(null); setComment(''); }, [viewer]);
  const ownerId = q.data?.pages[0]?.extras?.profile_id;
  useEffect(() => {
    setFollowDelta(0);
    if (!viewer || !ownerId || viewer === ownerId) { setFollowing(false); return; }
    void supabase.from('follows').select('follower_id').eq('follower_id', viewer).eq('followee_id', ownerId).maybeSingle().then(({ data }) => setFollowing(!!data));
  }, [viewer, ownerId]);
  if (q.isPending) return <div className="personal-empty" role="status" aria-live="polite">Opening personal profile…</div>;
  if (q.isError) return <div className="personal-empty" role="alert"><Lock /><h1>Profile couldn’t load</h1><p>Something went wrong. Please try again.</p><Button onClick={() => q.refetch()}>Try again</Button></div>;
  const first = q.data.pages[0];
  if (!first || first.unavailable) return <div className="personal-empty" data-profile-state="unavailable"><Lock /><h1>This profile isn’t available to you.</h1><p>It may be private, or it may not exist.</p><Button asChild variant="outline"><Link to="/">Back to PullBid Live</Link></Button></div>;
  const pages = q.data.pages.filter(p => !p.unavailable);
  const posts = pages.flatMap(p => p.posts), media = pages.flatMap(p => p.media), comments = pages.flatMap(p => p.comments), reactions = pages.flatMap(p => p.reactions), cards = pages.flatMap(p => p.cards);
  const slot = (s: string) => media.find(m => m.slot === s);
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await client.invalidateQueries({ queryKey: key }); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); } };
  const identity = first.identity!;
  const extras = first.extras;
  const followerCount = (extras?.followers ?? 0) + followDelta;
  const toggleFollow = async () => {
    if (!viewer) { window.location.href = '/auth'; return; }
    if (!extras) return;
    if (following) { const { error: e } = await supabase.from('follows').delete().eq('follower_id', viewer).eq('followee_id', extras.profile_id); if (e) return toast.error(e.message); setFollowing(false); setFollowDelta(d => d - 1); }
    else { const { error: e } = await supabase.from('follows').insert({ follower_id: viewer, followee_id: extras.profile_id }); if (e) return toast.error(e.message); setFollowing(true); setFollowDelta(d => d + 1); }
  };
  const isOwner = !!viewer && viewer === extras?.profile_id;
  const coverPos = lookPos ?? extras?.cover_position ?? 50;
  const layout = lookLayout ?? extras?.layout ?? 'classic';
  const centered = layout === 'centered', compact = layout === 'compact';
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!customizing) return;
    const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const startY = e.clientY, startPos = coverPos, h = el.getBoundingClientRect().height || 1;
    const move = (ev: PointerEvent) => setLookPos(Math.round(Math.min(100, Math.max(0, startPos - ((ev.clientY - startY) / h) * 100))));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  };
  const saveLook = async () => {
    if (!viewer) return;
    setSavingLook(true);
    const { error: e } = await supabase.from('profiles').update({ profile_cover_position: coverPos, profile_layout: layout }).eq('id', viewer);
    setSavingLook(false);
    if (e) return toast.error(e.message);
    toast.success('Profile look saved'); setCustomizing(false);
    await client.invalidateQueries({ queryKey: key }); setLookPos(null); setLookLayout(null);
  };
  const share = async () => {
    const url = `${window.location.origin}/@${identity.username}`;
    try { if (navigator.share) await navigator.share({ title: `@${identity.username} on PullBid Live`, url }); else { await navigator.clipboard.writeText(url); toast.success('Profile link copied'); } } catch { /* dismissed */ }
  };
  return <main className={`personal-page ${light ? 'theme-light' : ''}`} data-profile-view="visitor">
    <div className="mb-3 flex justify-end gap-2">{isOwner && <Button variant={customizing ? 'default' : 'outline'} size="sm" onClick={() => setCustomizing(c => !c)}><Palette />Customize</Button>}<Button variant="outline" size="sm" aria-pressed={light} onClick={() => { const v = !light; setLight(v); localStorage.setItem('pb-profile-theme', v ? 'light' : 'dark'); }}>{light ? <><Moon />Dark mode</> : <><Sun />Light mode</>}</Button></div>
    <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]">
      {customizing && <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-5 py-3 text-sm">
        <span className="font-bold">Layout</span>
        {(['classic', 'centered', 'compact'] as const).map(l => <Button key={l} size="sm" variant={layout === l ? 'default' : 'outline'} aria-pressed={layout === l} onClick={() => setLookLayout(l)} className="capitalize">{l}</Button>)}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Move size={14} />Drag the cover to reposition</span>
        <input type="range" min={0} max={100} value={coverPos} onChange={e => setLookPos(Number(e.target.value))} aria-label="Cover photo position" className="w-28" />
        <Button size="sm" variant="ghost" onClick={() => { setLookPos(null); setLookLayout(null); setCustomizing(false); }}>Cancel</Button>
        <Button size="sm" disabled={savingLook} onClick={() => void saveLook()}>{savingLook ? 'Saving…' : 'Save look'}</Button>
      </div>}
      <div onPointerDown={startDrag} className={`relative w-full touch-none ${compact ? 'h-24 sm:h-32' : 'h-40 sm:h-56'} ${customizing ? 'cursor-grab ring-2 ring-inset ring-primary' : ''}`} style={{ ['--cy' as string]: `${coverPos}%`,  background: 'radial-gradient(circle at 15% 25%, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 55%), radial-gradient(circle at 85% 75%, color-mix(in oklab, var(--accent) 60%, transparent) 0%, transparent 50%), linear-gradient(135deg, var(--muted), var(--background))' }}>
        {slot('cover0') && <div className="absolute inset-0 [&_img]:pointer-events-none [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:[object-position:50%_var(--cy)]"><VisitorMedia id={slot('cover0')!.id} kind="image" viewer={viewer} /></div>}
      </div>
      <div className="relative px-5 pb-5 sm:px-8">
        <div className={`flex flex-wrap gap-4 ${centered ? '-mt-16 flex-col items-center text-center' : compact ? '-mt-10 items-end' : '-mt-14 items-end sm:-mt-16'}`}>
          <div className={`${compact ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-28 w-28 sm:h-32 sm:w-32'} shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-card [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_.personal-empty]:hidden`}>
            {slot('avatar') ? <VisitorMedia id={slot('avatar')!.id} kind="image" viewer={viewer} />
              : extras?.avatar_url ? <img src={extras.avatar_url} alt={`${identity.display_name} profile photo`} />
              : <span className="flex h-full w-full items-center justify-center bg-[image:var(--gradient-primary)] text-4xl font-black uppercase text-primary-foreground">{identity.display_name.slice(0, 1)}</span>}
          </div>
          <div className={`min-w-0 pb-1 ${centered ? '' : 'flex-1'}`}>
            <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">{identity.display_name}</h1>
            <p className="text-sm font-semibold text-primary">@{identity.username}</p>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {extras && viewer !== extras.profile_id && <Button onClick={() => void toggleFollow()} variant={following ? 'outline' : 'default'}>{following ? <><UserCheck />Following</> : <><UserPlus />Follow</>}</Button>}
            {extras && viewer && viewer !== extras.profile_id && <Button asChild variant="outline"><Link to="/messages/$userId" params={{ userId: extras.profile_id }}><MessageCircle />Message</Link></Button>}
            <Button variant="outline" onClick={() => void share()}><Share2 />Share</Button>
          </div>
        </div>
        {identity.bio && <p className={`mt-4 max-w-2xl ${centered ? 'mx-auto text-center' : ''} whitespace-pre-wrap text-sm text-muted-foreground`}>{identity.bio}</p>}
        <div className={`mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm ${centered ? 'justify-center' : ''}`}>
          <span><strong>{followerCount}</strong> <span className="text-muted-foreground">followers</span></span>
          <span><strong>{extras?.following ?? 0}</strong> <span className="text-muted-foreground">following</span></span>
          <span><strong>{posts.length}</strong> <span className="text-muted-foreground">posts</span></span>
          {extras?.joined && <span className="text-muted-foreground">Joined {new Date(extras.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
        </div>
      </div>
    </section>
    <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t, i) => <Button key={t} variant="ghost" className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</Button>)}</nav>
    <div className="personal-body"><section className="personal-timeline">
      {tab === 'Posts' && <><div className="personal-section-heading"><h2>The latest chapter.</h2><span>{posts.length} stories</span></div><div className="personal-post-grid">{posts.map((p, i) => { const mine = reactions.some(r => r.post_id === p.id && r.mine); return <article id={`post-${p.id}`} key={p.id} className={`personal-post ${media.some(m => m.post_id === p.id) ? 'photo-story' : 'note-story'} ${p.collectible_id ? 'collectible-story' : ''} ${i === 0 ? 'lead-story' : ''}`}>
        <div className="personal-post-meta"><span>{p.pinned && <Pin size={13} />}{LABELS[p.audience]}</span></div><p className="personal-author">@{identity.username}<span>{new Date(p.created_at).toLocaleDateString()}</span></p><p className="personal-story-caption">{p.caption}</p>
        {p.collectible_id && <div className="personal-collectible-heading"><span className="personal-eyebrow">COLLECTOR SPOTLIGHT</span><h3>{cards.find(c => c.id === p.collectible_id)?.name ?? 'Private collectible'}</h3></div>}
        {media.filter(m => m.post_id === p.id).map(m => <VisitorMedia key={m.id} id={m.id} kind={m.kind} viewer={viewer} />)}
        <div className="personal-post-actions"><Button variant="ghost" aria-label="Appreciate story" aria-pressed={mine} disabled={!viewer} onClick={() => act(() => interact({ data: { post_id: p.id, kind: 'react', value: !mine } }))}><Sparkles />{reactions.filter(r => r.post_id === p.id).length}</Button><Button variant="ghost" aria-label="Open conversation" onClick={() => setOpen(open === p.id ? null : p.id)}><MessageCircle />{comments.filter(c => c.post_id === p.id).length}</Button></div>
        {open === p.id && <div>{comments.filter(c => c.post_id === p.id).map(c => <p key={c.id}>{c.content}</p>)}{viewer && p.allow_comments ? <><Textarea aria-label="Comment" value={comment} onChange={e => setComment(e.target.value)} /><Button disabled={!comment.trim()} onClick={() => act(async () => { await interact({ data: { post_id: p.id, kind: 'comment', content: comment } }); setComment(''); })}>Add comment</Button></> : !viewer ? <Button asChild variant="outline"><Link to="/auth">Sign in to comment</Link></Button> : null}</div>}
      </article>; })}{!posts.length && <div className="rounded-2xl border border-dashed border-border p-10 text-center"><Sparkles className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-2 font-bold">No posts yet</h3><p className="text-sm text-muted-foreground">When @{identity.username} shares something, it'll show up here.</p></div>}</div>{q.hasNextPage && <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more stories</Button>}</>}
      {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{identity.bio}</p></section>}
      {(tab === 'Photos' || tab === 'Videos') && <div className="personal-gallery">{media.filter(m => m.slot === 'post' && m.kind === (tab === 'Photos' ? 'image' : 'video')).map(m => <article key={m.id}><VisitorMedia id={m.id} kind={m.kind} viewer={viewer} /></article>)}</div>}
      {tab === 'Collectibles' && <div className="personal-gallery">{posts.filter(p => p.collectible_id).map(p => <article key={p.id}><Gem /><h3>{cards.find(c => c.id === p.collectible_id)?.name ?? 'Private collectible'}</h3><p>{p.caption}</p></article>)}</div>}
      {tab === 'Activity' && posts.map(p => <p key={p.id} className="personal-activity">Shared a story · {new Date(p.created_at).toLocaleDateString()}</p>)}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>{extras?.has_store ? <aside className="personal-aside"><span className="personal-eyebrow">SHOP WITH @{username.toUpperCase()}</span><h3>{extras.shop_name || 'Visit the store.'}</h3><p>Items for sale, open to offers and trades — with search and filters.</p><div className="personal-separate-links"><Button asChild><Link to="/seller/$username" params={{ username }}>Open store →</Link></Button></div></aside> : null}</div>
  </main>;
}
