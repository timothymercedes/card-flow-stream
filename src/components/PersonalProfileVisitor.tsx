import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Gem, Lock, MessageCircle, Sparkles, Pin } from 'lucide-react';
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
  useEffect(() => { setOpen(null); setComment(''); }, [viewer]);
  if (q.isPending) return <div className="personal-empty" role="status" aria-live="polite">Opening personal profile…</div>;
  if (q.isError) return <div className="personal-empty" role="alert"><Lock /><h1>Profile couldn’t load</h1><p>Something went wrong. Please try again.</p><Button onClick={() => q.refetch()}>Try again</Button></div>;
  const first = q.data.pages[0];
  if (!first || first.unavailable) return <div className="personal-empty" data-profile-state="unavailable"><Lock /><h1>This profile isn’t available to you.</h1><p>It may be private, or it may not exist.</p><Button asChild variant="outline"><Link to="/">Back to PullBid Live</Link></Button></div>;
  const pages = q.data.pages.filter(p => !p.unavailable);
  const posts = pages.flatMap(p => p.posts), media = pages.flatMap(p => p.media), comments = pages.flatMap(p => p.comments), reactions = pages.flatMap(p => p.reactions), cards = pages.flatMap(p => p.cards);
  const slot = (s: string) => media.find(m => m.slot === s);
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await client.invalidateQueries({ queryKey: key }); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); } };
  const identity = first.identity!;
  return <main className="personal-page" data-profile-view="visitor">
    <section className="personal-masthead"><div className="personal-identity">
      <div className="personal-portrait">{slot('avatar') ? <VisitorMedia id={slot('avatar')!.id} kind="image" viewer={viewer} /> : <span>{identity.display_name.slice(0, 1)}</span>}</div>
      <div className="personal-name"><h1>{identity.display_name}<em>.</em></h1><p>@{identity.username}</p></div><p className="personal-bio">{identity.bio}</p>
    </div><div className="personal-cover">{(['cover0', 'cover1', 'cover2'] as const).map(s => <div key={s} className="personal-candidate-panel">{slot(s) ? <VisitorMedia id={slot(s)!.id} kind="image" viewer={viewer} /> : <div className="personal-empty"><Gem /></div>}</div>)}<div className="personal-cover-caption"><span>COLLECTOR JOURNAL / 01</span><h2>Stories worth keeping.</h2></div></div></section>
    <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t, i) => <Button key={t} variant="ghost" className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}><span>0{i + 1}</span>{t}</Button>)}</nav>
    <div className="personal-body"><section className="personal-timeline">
      {tab === 'Posts' && <><div className="personal-section-heading"><h2>The latest chapter.</h2><span>{posts.length} stories</span></div><div className="personal-post-grid">{posts.map((p, i) => { const mine = reactions.some(r => r.post_id === p.id && r.mine); return <article id={`post-${p.id}`} key={p.id} className={`personal-post ${media.some(m => m.post_id === p.id) ? 'photo-story' : 'note-story'} ${p.collectible_id ? 'collectible-story' : ''} ${i === 0 ? 'lead-story' : ''}`}>
        <div className="personal-post-meta"><span>{p.pinned && <Pin size={13} />}{LABELS[p.audience]}</span></div><p className="personal-author">@{identity.username}<span>{new Date(p.created_at).toLocaleDateString()}</span></p><p className="personal-story-caption">{p.caption}</p>
        {p.collectible_id && <div className="personal-collectible-heading"><span className="personal-eyebrow">COLLECTOR SPOTLIGHT</span><h3>{cards.find(c => c.id === p.collectible_id)?.name ?? 'Private collectible'}</h3></div>}
        {media.filter(m => m.post_id === p.id).map(m => <VisitorMedia key={m.id} id={m.id} kind={m.kind} viewer={viewer} />)}
        <div className="personal-post-actions"><Button variant="ghost" aria-label="Appreciate story" aria-pressed={mine} disabled={!viewer} onClick={() => act(() => interact({ data: { post_id: p.id, kind: 'react', value: !mine } }))}><Sparkles />{reactions.filter(r => r.post_id === p.id).length}</Button><Button variant="ghost" aria-label="Open conversation" onClick={() => setOpen(open === p.id ? null : p.id)}><MessageCircle />{comments.filter(c => c.post_id === p.id).length}</Button></div>
        {open === p.id && <div>{comments.filter(c => c.post_id === p.id).map(c => <p key={c.id}>{c.content}</p>)}{viewer && p.allow_comments ? <><Textarea aria-label="Comment" value={comment} onChange={e => setComment(e.target.value)} /><Button disabled={!comment.trim()} onClick={() => act(async () => { await interact({ data: { post_id: p.id, kind: 'comment', content: comment } }); setComment(''); })}>Add comment</Button></> : !viewer ? <Button asChild variant="outline"><Link to="/auth">Sign in to comment</Link></Button> : null}</div>}
      </article>; })}{!posts.length && <div className="personal-empty"><h3>No stories to show.</h3></div>}</div>{q.hasNextPage && <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Load more stories</Button>}</>}
      {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{identity.bio}</p></section>}
      {(tab === 'Photos' || tab === 'Videos') && <div className="personal-gallery">{media.filter(m => m.slot === 'post' && m.kind === (tab === 'Photos' ? 'image' : 'video')).map(m => <article key={m.id}><VisitorMedia id={m.id} kind={m.kind} viewer={viewer} /></article>)}</div>}
      {tab === 'Collectibles' && <div className="personal-gallery">{posts.filter(p => p.collectible_id).map(p => <article key={p.id}><Gem /><h3>{cards.find(c => c.id === p.collectible_id)?.name ?? 'Private collectible'}</h3><p>{p.caption}</p></article>)}</div>}
      {tab === 'Activity' && posts.map(p => <p key={p.id} className="personal-activity">Shared a story · {new Date(p.created_at).toLocaleDateString()}</p>)}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section><aside className="personal-aside"><span className="personal-eyebrow">SEPARATE DESTINATIONS</span><div className="personal-separate-links"><Button variant="link" asChild><Link to="/seller/$username" params={{ username }}>Seller storefront</Link></Button></div></aside></div>
  </main>;
}
