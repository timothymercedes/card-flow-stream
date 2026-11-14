import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Pencil, Settings, Gem, Video, ImagePlus, Sparkles, MessageCircle, Pin, Trash2, Lock, Share2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PERSONAL_PROFILE_TABS, type PersonalProfileTab } from '@/lib/personalProfilePreview';
import { candidateIdentity, candidatePost, candidateProfileLink, candidatePostLink } from '@/lib/personalProfileCandidate';
import { loadPersonalCandidate, savePersonalIdentity, savePersonalPost, controlPersonalPost, changePersonalComment, preparePersonalMedia, removePersonalMedia } from '@/lib/personalProfileCandidate.functions';
import { PersonalCandidateMedia } from './PersonalCandidateMedia';

const LABELS = { public: 'Public', followers: 'Followers', friends: 'Close friends', only_me: 'Only me' };
type Audience = keyof typeof LABELS;
export function PersonalProfileCandidate({ username }: { username?: string }) {
  const { session } = useAuth();
  const viewer = session?.user.id;
  const client = useQueryClient();
  const fetch = useServerFn(loadPersonalCandidate), saveIdentity = useServerFn(savePersonalIdentity), savePost = useServerFn(savePersonalPost), control = useServerFn(controlPersonalPost), commentAction = useServerFn(changePersonalComment), prepare = useServerFn(preparePersonalMedia), removeMedia = useServerFn(removePersonalMedia);
  const key = ['personal-candidate', viewer, username];
  const query = useQuery({ queryKey: key, queryFn: () => fetch({ data: { username } }), enabled: !!viewer, staleTime: 0 });
  const [tab, setTab] = useState<PersonalProfileTab>('Posts');
  const [dialog, setDialog] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>();
  const [fields, setFields] = useState({ username: '', display_name: '', bio: '', audience: 'only_me' as Audience });
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<Audience>('only_me');
  const [cardId, setCardId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const model = query.data;
  const identity = model?.identity;
  const owner = !!viewer && !!model && !model.unavailable;
  const refresh = async () => { await client.invalidateQueries({ queryKey: key }); };
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setError(''); try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); } finally { setBusy(false); } };
  const openIdentity = () => { setFields({ username: identity?.username ?? '', display_name: identity?.display_name ?? '', bio: identity?.bio ?? '', audience: identity?.audience as Audience ?? 'only_me' }); setDialog('Edit profile'); setError(''); };
  const openPost = (id?: string) => { const p = model?.posts.find(p => p.id === id); setEditId(id); setCaption(p?.caption ?? ''); setAudience(p?.audience as Audience ?? 'only_me'); setCardId(p?.collectible_id ?? null); setFiles([]); setDialog('Story'); setError(''); };
  const upload = async (file: File, post_id: string | null, slot: 'post' | 'avatar' | 'cover0' | 'cover1' | 'cover2') => {
    const mime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' } as const;
    const extension = mime[file.type as keyof typeof mime];
    if (!extension || file.size > 20 * 1024 * 1024 || (slot !== 'post' && !file.type.startsWith('image/'))) throw new Error('Choose a JPG, PNG, WebP, MP4 or WebM file up to 20 MB.');
    const binding = await prepare({ data: { post_id, slot, kind: file.type.startsWith('video/') ? 'video' : 'image', extension } });
    const result = await supabase.storage.from('personal-profile-media').upload(binding.object_path, file, { contentType: file.type, cacheControl: '0', upsert: false });
    if (result.error) { await removeMedia({ data: { id: binding.id } }); throw result.error; }
  };
  const media = model?.media ?? [];
  const photoSlot = (slot: string) => media.find(m => m.slot === slot);
  const renderMedia = (m: typeof media[number]) => viewer ? <PersonalCandidateMedia key={`${viewer}:${m.id}`} path={m.object_path} kind={m.kind} viewer={viewer} alt={m.kind === 'video' ? 'Story video' : 'Profile photograph'} /> : null;
  const posts = [...(model?.posts ?? [])].sort((a,b) => Number(b.pinned)-Number(a.pinned));
  return <AppShell><div className="personal-profile-theme" data-profile-component="PersonalProfileCandidate">
    <div className="personal-review"><strong className="personal-preview-label">PREVIEW DESIGN · REAL-ACCOUNT CANDIDATE</strong><code>/preview/personal-profile-candidate</code><span>{viewer ? 'Isolated draft · visitor access locked' : 'Sign in to review your isolated personal profile'}</span></div>
    {!viewer ? <div className="personal-empty"><Lock /><h1>Sign in to your personal profile</h1><Button asChild><Link to="/auth" search={{ returnTo: '/preview/personal-profile-candidate' }}>Sign in</Link></Button><Button asChild variant="outline"><Link to="/preview/personal-profile">Open demonstration design</Link></Button></div> : query.isPending ? <div className="personal-empty">Opening personal profile…</div> : query.isError ? <div className="personal-empty" role="alert"><p>{query.error.message}</p><Button onClick={() => query.refetch()}>Retry</Button></div> : model?.unavailable ? <div className="personal-empty"><Lock /><h1>Profile unavailable</h1><p>Visitor access remains locked while privacy safeguards are under review.</p></div> : <main className="personal-page">
      <section className="personal-masthead"><div className="personal-identity">
        <div className="personal-portrait">{photoSlot('avatar') ? renderMedia(photoSlot('avatar') as typeof media[number]) : <span>{identity?.display_name.slice(0,1) ?? '?'}</span>}<Button size="icon" aria-label="Change profile photo" onClick={() => setDialog('avatar')}><Camera /></Button></div>
        <div className="personal-name"><h1>{identity?.display_name ?? 'Your personal profile'}<em>.</em></h1><p>{identity ? `@${identity.username}` : 'Create your social identity'}</p></div><p className="personal-bio">{identity?.bio}</p>
        <div className="personal-counts"><span>Followers —</span><span>Following —</span></div>
        <div className="personal-identity-actions"><Button onClick={openIdentity}><Pencil />Edit profile</Button><Button asChild variant="outline" title="Account settings"><Link to="/profile" aria-label="Account settings"><Settings /></Link></Button><Button variant="outline" aria-label="Share profile" disabled={!identity} onClick={() => run(async () => { if (identity) await navigator.clipboard.writeText(window.location.origin + candidateProfileLink(identity.username)); })}><Share2 /></Button></div>
      </div><div className="personal-cover">{(['cover0','cover1','cover2'] as const).map(slot => { const m = photoSlot(slot); return <div key={slot} className="personal-candidate-panel">{m ? renderMedia(m) : <div className="personal-empty"><Gem /></div>}</div>; })}<div className="personal-cover-caption"><span>COLLECTOR JOURNAL / 01</span><h2>Stories worth keeping.</h2></div><Button variant="outline" size="icon" aria-label="Change cover" onClick={() => setDialog('Cover photos')}><Camera /></Button></div></section>
      <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t,i) => <Button key={t} variant="ghost" className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}><span>0{i+1}</span>{t}</Button>)}</nav>
      <div className="personal-body"><section className="personal-timeline">
        {tab === 'Posts' && <><div className="personal-composer"><Button variant="ghost" className="personal-prompt" onClick={() => openPost()}>What’s your latest story?</Button><Button variant="ghost" size="icon" aria-label="Add photos" onClick={() => openPost()}><ImagePlus /></Button><Button variant="ghost" size="icon" aria-label="Add video" onClick={() => openPost()}><Video /></Button><Button variant="ghost" size="icon" aria-label="Share collectible" onClick={() => openPost()}><Gem /></Button></div><div className="personal-section-heading"><h2>The latest chapter.</h2><span>{posts.length} stories</span></div><div className="personal-post-grid">{posts.map((p,i) => <article id={`post-${p.id}`} key={p.id} className={`personal-post ${media.some(m => m.post_id === p.id) ? 'photo-story' : 'note-story'} ${p.collectible_id ? 'collectible-story' : ''} ${i === 0 ? 'lead-story' : ''}`}>
          <div className="personal-post-meta"><span>{p.pinned && <Pin size={13} />}<Lock className="inline size-3" />{LABELS[p.audience as Audience]}</span><Button variant="ghost" size="icon" aria-label="Edit story" onClick={() => openPost(p.id)}><Pencil /></Button></div><p className="personal-author">@{identity?.username}<span>{new Date(p.created_at).toLocaleDateString()}</span></p><p className="personal-story-caption">{p.caption}</p>
          {p.collectible_id && <div className="personal-collectible-heading"><span className="personal-eyebrow">COLLECTOR SPOTLIGHT</span><h3>{model?.cards.find(c => c.id === p.collectible_id)?.name ?? 'Collectible unavailable'}</h3><p>Private collection reference · no Vault photo exposed</p></div>}
          {media.filter(m => m.post_id === p.id).map(renderMedia)}
          <div className="personal-post-actions"><Button variant="ghost" aria-label="Appreciate story" aria-pressed={model?.reactions.some(r => r.post_id === p.id)} disabled={busy} onClick={() => run(() => control({ data: { id: p.id, action: 'react', value: !model?.reactions.some(r => r.post_id === p.id) } }))}><Sparkles />{model?.reactions.filter(r => r.post_id === p.id).length}</Button><Button variant="ghost" aria-label="Open conversation" onClick={() => { setEditId(p.id); setComment(''); setDialog('Conversation'); }}><MessageCircle />{model?.comments.filter(c => c.post_id === p.id).length}</Button><Button variant="ghost" aria-label="Pin story" aria-pressed={p.pinned} disabled={busy} onClick={() => run(() => control({ data: { id: p.id, action: 'pin', value: !p.pinned } }))}><Pin /></Button><Button variant="ghost" aria-label="Delete story" onClick={() => { setEditId(p.id); setDialog('Delete story'); }}><Trash2 /></Button><Button variant="ghost" aria-label="Share story" onClick={() => run(async () => { if (identity) await navigator.clipboard.writeText(window.location.origin + candidatePostLink(identity.username, p.id)); })}><Share2 /></Button></div>
        </article>)}{!posts.length && <div className="personal-empty"><h3>No stories yet.</h3></div>}</div></>}
        {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{identity?.bio}</p></section>}
        {(tab === 'Photos' || tab === 'Videos') && <><h2>{tab === 'Photos' ? 'Life through a lens.' : 'Moving moments.'}</h2><div className="personal-gallery">{media.filter(m => m.slot === 'post' && m.kind === (tab === 'Photos' ? 'image' : 'video')).map(m => <article key={m.id}>{renderMedia(m)}<Button variant="ghost" aria-label="Delete media" disabled={busy} onClick={() => run(() => removeMedia({ data: { id: m.id } }))}><Trash2 /></Button></article>)}</div></>}
        {tab === 'Collectibles' && <><h2>Showcase.</h2><div className="personal-gallery">{posts.filter(p => p.collectible_id).map(p => <article key={p.id}><Gem /><h3>{model?.cards.find(c => c.id === p.collectible_id)?.name ?? 'Collectible unavailable'}</h3><p>{p.caption}</p></article>)}</div></>}
        {tab === 'Activity' && <><h2>Recent chapters.</h2>{posts.map(p => <p key={p.id} className="personal-activity">Shared a story · {new Date(p.created_at).toLocaleDateString()}</p>)}</>}
      </section><aside className="personal-aside"><span className="personal-eyebrow">SEPARATE DESTINATIONS</span><h3>Curiosity is the collection.</h3><div className="personal-separate-links"><Button variant="link" asChild><Link to="/sell">Seller hub (commerce)</Link></Button><Button variant="link" asChild><Link to="/vault">Collector Vault (private)</Link></Button><Button variant="outline" asChild><Link to="/profile"><Settings />Account & security</Link></Button></div></aside></div>
    </main>}
    {error && <p role="alert" className="p-4 text-destructive">{error}</p>}
    <Dialog open={!!dialog && owner} onOpenChange={v => { if (!v) setDialog(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>{dialog}</DialogTitle><DialogDescription>Changes are saved only in this isolated draft. Visitor access stays locked.</DialogDescription>
      {dialog === 'Edit profile' && <form onSubmit={e => { e.preventDefault(); void run(async () => { await saveIdentity({ data: candidateIdentity.parse(fields) }); setDialog(null); }); }}><label>Display name<Input required value={fields.display_name} onChange={e => setFields({...fields,display_name:e.target.value})} /></label><label>Username<Input required value={fields.username} onChange={e => setFields({...fields,username:e.target.value.toLowerCase()})} /></label><label>Bio<Textarea aria-label="Bio" value={fields.bio} onChange={e => setFields({...fields,bio:e.target.value})} /></label><Button type="submit" disabled={busy}>Save profile</Button></form>}
      {dialog === 'Story' && <form onSubmit={e => { e.preventDefault(); void run(async () => { const p = await savePost({ data: candidatePost.parse({ id: editId, caption, audience, collectible_id:cardId }) }); for (const file of files) await upload(file,p.id,'post'); setDialog(null); }); }}><label>Your story<Textarea aria-label="Your story" required value={caption} onChange={e => setCaption(e.target.value)} /></label><label>Who can see this<select className="w-full border bg-background p-2" value={audience} onChange={e => setAudience(e.target.value as Audience)}>{Object.entries(LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Collectible reference<select className="w-full border bg-background p-2" value={cardId ?? ''} onChange={e => setCardId(e.target.value || null)}><option value="">None</option>{model?.cards.map(c => <option key={c.id} value={c.id}>{c.name} · {c.visibility}</option>)}</select></label><label>Photos or video<Input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => setFiles(Array.from(e.target.files ?? []))} /></label>{editId && media.filter(m => m.post_id === editId).map(m => <div key={m.id}>{renderMedia(m)}<Button variant="outline" disabled={busy} onClick={() => run(() => removeMedia({ data: { id:m.id } }))}>Remove media</Button></div>)}<Button type="submit" disabled={busy || !caption.trim()}>{editId ? 'Save changes' : 'Publish story to draft'}</Button></form>}
      {(dialog === 'avatar' || dialog === 'Cover photos') && <>{(dialog === 'avatar' ? ['avatar'] as const : ['cover0','cover1','cover2'] as const).map(slot => <label key={slot}>{slot === 'avatar' ? 'Profile photo' : `Cover panel ${Number(slot.slice(-1))+1}`}<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; void run(async () => { await upload(file,null,slot); const previous = media.filter(m => m.slot === slot); for (const m of previous) await removeMedia({ data: { id:m.id } }); }); }} /></label>)}<Button onClick={() => setDialog(null)}>Done</Button></>}
      {dialog === 'Delete story' && <Button variant="destructive" disabled={busy} onClick={() => run(async () => { if (editId) await control({ data: { id:editId,action:'delete' } }); setDialog(null); })}>Confirm deletion</Button>}
      {dialog === 'Conversation' && editId && <>{model?.comments.filter(c => c.post_id === editId).map(c => <div key={c.id}><p>{c.content}</p><Button variant="ghost" aria-label="Delete comment" onClick={() => run(() => commentAction({ data: { post_id:editId,id:c.id,remove:true } }))}><Trash2 /></Button><Button variant="ghost" aria-label="Edit comment" onClick={() => { setComment(c.content); setDialog(`Edit comment:${c.id}`); }}><Pencil /></Button></div>)}<Textarea aria-label="Comment" value={comment} onChange={e => setComment(e.target.value)} /><Button disabled={busy || !comment.trim() || !model?.posts.find(p => p.id === editId)?.allow_comments} onClick={() => run(async () => { await commentAction({ data: { post_id:editId,content:comment } }); setComment(''); })}>Add comment</Button><Button variant="outline" disabled={busy} onClick={() => run(() => control({ data: { id:editId,action:'comments',value:!model?.posts.find(p => p.id === editId)?.allow_comments } }))}>{model?.posts.find(p => p.id === editId)?.allow_comments ? 'Disable comments' : 'Enable comments'}</Button></>}
      {dialog?.startsWith('Edit comment:') && editId && <><Textarea aria-label="Edit comment text" value={comment} onChange={e => setComment(e.target.value)} /><Button disabled={busy || !comment.trim()} onClick={() => run(async () => { await commentAction({ data: { post_id:editId,id:dialog.split(':')[1],content:comment } }); setDialog('Conversation'); })}>Save comment</Button></>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </DialogContent></Dialog>
  </div></AppShell>;
}