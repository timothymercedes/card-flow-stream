import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera, Pencil, Settings, ArrowUpRight, ImagePlus, Video, Gem, Sparkles, MessageCircle, Repeat2, Share2, Lock, MoreHorizontal, Pin, Trash2, Send, FlaskConical } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PERSONAL_PROFILE_TABS, type PersonalProfileTab } from '@/lib/personalProfilePreview';
import { AUDIENCE_LABEL, DEMO_PROFILE, DEMO_VIEWERS, DEMO_POSTS, visiblePosts, showcaseCards, editDemoPost, demoCanInteract, demoCanRepost, type DemoAudience, type DemoPhoto, type DemoPost, type DemoViewer } from '@/lib/personalProfileDemo';
import showcase from '@/assets/profile-demo/collector-showcase.jpg';
import coverShowcase from '@/assets/profile-demo/collector-showcase-refined.jpg';
import grading from '@/assets/profile-demo/grading-desk.jpg';
import packs from '@/assets/profile-demo/pack-opening.jpg';
import community from '@/assets/profile-demo/community-meetup.jpg';
const PHOTOS: Record<DemoPhoto, string> = { showcase, grading, packs, community };
const PHOTO_LABELS: Record<DemoPhoto, string> = { showcase: 'Demonstration trading-card display with fantasy and sports slabs', grading: 'Demonstration collector inspecting a card before grading', packs: 'Demonstration foil trading-card pack opening', community: 'Demonstration collectors comparing binders at a community meetup' };

export function PersonalProfilePreview({ account, initialVisitor = false, routeLabel }: { account: ReactNode; initialVisitor?: boolean; routeLabel?: string }) {
  const [tab, setTab] = useState<PersonalProfileTab>('Posts');
  const [accountOpen, setAccountOpen] = useState(false);
  const [viewer, setViewer] = useState<DemoViewer>(initialVisitor ? 'guest' : 'owner');
  const [draft, setDraft] = useState({ name: DEMO_PROFILE.name, bio: DEMO_PROFILE.bio, location: DEMO_PROFILE.location });
  const [dialog, setDialog] = useState<string | null>(null);
  const [story, setStory] = useState<DemoPost | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [local, setLocal] = useState<DemoPost[]>(DEMO_POSTS);
  const [selectedPhotos, setSelectedPhotos] = useState<DemoPhoto[]>([]);
  const [portrait, setPortrait] = useState<DemoPhoto | null>(null);
  const [cover, setCover] = useState<[string, string, string]>([coverShowcase, grading, community]);
  const [comments, setComments] = useState<Record<string, { author: string; text: string }[]>>({});
  const [comment, setComment] = useState('');
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [pinned, setPinned] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<DemoAudience>('only_me');
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const font = document.createElement('link'); font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(font); return () => font.remove();
  }, []);
  const owner = viewer === 'owner';
  if (accountOpen) return <><div className="personal-profile-theme personal-review"><strong className="personal-preview-label">PREVIEW DESIGN · ACCOUNT SETTINGS (unchanged)</strong><Button variant="outline" onClick={() => setAccountOpen(false)}>← Personal profile</Button></div>{account}</>;
  const posts = visiblePosts(viewer, local).filter(p => !hidden.includes(p.id)).sort((a, b) => a.id === pinned ? -1 : b.id === pinned ? 1 : 0);
  const cards = showcaseCards(viewer);
  const images = posts.flatMap(p => p.photos.map((ph, i) => ({ key: `${p.id}-${i}`, src: PHOTOS[ph] })));
  const open = (t: string, s?: DemoPost) => { setDialog(t); setStory(s ?? null); setCaption(s?.caption ?? ''); setAudience(s?.audience ?? 'only_me'); setSelectedPhotos(s?.photos ?? []); setComment(''); setNotice(''); };
  const switchViewer = (v: DemoViewer) => { setViewer(v); setDialog(null); setStory(null); setPhoto(null); setComment(''); setNotice(''); };
  const composer = ['Create a story', 'Edit story', 'Photo story', 'Video story', 'Collectible story'].includes(dialog ?? '');
  const submit = () => {
    if (!owner || !caption.trim()) return;
    if (dialog === 'Edit story' && story) setLocal(v => editDemoPost(v, story.id, caption, audience));
    else {
      const kind = dialog === 'Collectible story' ? 'collectible' : dialog === 'Video story' ? 'video' : 'story';
      setLocal(v => [{ id: `draft-${crypto.randomUUID()}`, kind, caption: caption.trim(), photos: selectedPhotos, audience, date: new Date().toISOString().slice(0, 10), appreciations: 0, comments: 0, ...(kind === 'collectible' ? { collectible: { name: 'Demo collector spotlight', series: 'Demonstration showcase', finish: 'Shared gallery' } } : {}) }, ...v]);
    }
    setDialog(null);
  };
  const viewerLabel = DEMO_VIEWERS.find(v => v.id === viewer)?.label ?? 'Owner';
  return <AppShell><div className="personal-profile-theme" data-profile-component="PersonalProfilePreview" data-demo-viewer={viewer}>
    <div className="personal-review"><div><strong className="personal-preview-label">PREVIEW DESIGN</strong><strong className="personal-preview-label"><FlaskConical className="inline size-3" /> DEMONSTRATION DATA</strong>{routeLabel && <code data-preview-route>{routeLabel}</code>}<span>{owner ? 'Owner view · demo profile, no customer data' : `SIMULATED ${viewerLabel.toUpperCase()} VIEW · not real visitor access`}</span></div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Simulate viewer">{DEMO_VIEWERS.map(v => <Button key={v.id} size="sm" variant={viewer === v.id ? 'default' : 'outline'} aria-pressed={viewer === v.id} onClick={() => switchViewer(v.id)}>{v.label}</Button>)}</div></div>
    <main className="personal-page">
      <section className="personal-masthead">
        <div className="personal-identity">
          <div className="personal-portrait">{portrait ? <img src={PHOTOS[portrait]} alt="Selected demonstration profile photo" /> : <span>{draft.name.slice(0, 1)}</span>}{owner && <Button size="icon" aria-label="Change profile photo" onClick={() => open('Profile photo')}><Camera /></Button>}</div>
          <div className="personal-name"><h1>{draft.name}<em>.</em></h1><p>@{DEMO_PROFILE.username} · demo</p></div>
          <p className="personal-bio">{draft.bio}{draft.location && <><br /><span>{draft.location}</span></>}</p>
          <div className="personal-counts"><Button variant="ghost" onClick={() => open('Followers')}><strong>{DEMO_PROFILE.followers.toLocaleString()}</strong><span>Followers</span></Button><Button variant="ghost" onClick={() => open('Following')}><strong>{DEMO_PROFILE.following}</strong><span>Following</span></Button></div>
          <div className="personal-identity-actions">{owner ? <><Button onClick={() => open('Edit personal profile')}><Pencil />Edit profile</Button><Button variant="outline" aria-label="Account settings" title="Account settings" onClick={() => setAccountOpen(true)}><Settings /></Button></> : <Button variant="outline" disabled={viewer === 'guest'} aria-pressed={!!following[viewer]} onClick={() => setFollowing(v => ({ ...v, [viewer]: !v[viewer] }))}>{following[viewer] ? 'Following' : 'Follow'}</Button>}<Button variant="outline" aria-label="Share profile" onClick={() => open('Share profile')}><Share2 /></Button></div>
        </div>
        <div className="personal-cover"><img src={cover[0]} alt={PHOTO_LABELS.showcase} width={1536} height={1024} /><img src={cover[1]} alt={PHOTO_LABELS.grading} width={1024} height={1024} /><img src={cover[2]} alt={PHOTO_LABELS.community} width={1024} height={1024} /><div className="personal-cover-caption"><span>COLLECTOR JOURNAL / 01</span><h2>Stories worth keeping.</h2></div>{owner && <Button variant="outline" size="icon" aria-label="Change cover" onClick={() => open('Cover photos')}><Camera /></Button>}</div>
      </section>
      <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t, i) => <Button key={t} variant="ghost" aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}><span>0{i + 1}</span>{t}</Button>)}</nav>
      <div className="personal-body"><section className="personal-timeline">
        {tab === 'Posts' && <>
          {owner && <div className="personal-composer"><Button variant="ghost" className="personal-prompt" onClick={() => open('Create a story')}>What’s your latest story?</Button><Button variant="ghost" size="icon" aria-label="Add photos" onClick={() => open('Photo story')}><ImagePlus /></Button><Button variant="ghost" size="icon" aria-label="Add video" onClick={() => open('Video story')}><Video /></Button><Button variant="ghost" size="icon" aria-label="Share collectible" onClick={() => open('Collectible story')}><Gem /></Button></div>}
          <div className="personal-section-heading"><h2>The latest chapter.</h2><span>{posts.length} visible to {owner ? 'you' : viewerLabel.toLowerCase()}</span></div>
          <div className="personal-post-grid">
            {posts.map((p, i) => <article key={p.id} className={`personal-post ${p.photos.length ? 'photo-story' : 'note-story'} ${p.kind === 'collectible' ? 'collectible-story' : ''} ${i === 0 ? 'lead-story' : ''}`}>
              <div className="personal-post-meta"><span>{pinned === p.id && <Pin size={13} />}{p.kind === 'video' ? 'Video · ' : p.kind === 'collectible' ? 'Collectible · ' : ''}<Lock className="inline size-3" /> {AUDIENCE_LABEL[p.audience]}{p.id.startsWith('draft-') && ' · draft'}</span>{owner && <Button variant="ghost" size="icon" aria-label="Manage story" onClick={() => open('Manage story', p)}><MoreHorizontal /></Button>}</div>
              <p className="personal-author">@{DEMO_PROFILE.username} <span>{new Date(p.date).toLocaleDateString()}</span></p>
              <p className="personal-story-caption">{p.caption}</p>
              {p.collectible && <div className="personal-collectible-heading"><span className="personal-eyebrow"><Gem className="inline size-3" /> COLLECTOR SPOTLIGHT</span><h3>{p.collectible.name}</h3><p>{p.collectible.series}</p><span className="personal-collectible-finish">{p.collectible.finish}</span></div>}
              {p.photos.length > 0 && <div className={p.photos.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>{p.photos.map((ph, j) => <Button key={j} variant="ghost" className="personal-story-media" onClick={() => setPhoto(PHOTOS[ph])}><img src={PHOTOS[ph]} alt={PHOTO_LABELS[ph]} loading="lazy" width={ph === 'showcase' ? 1536 : 1024} height={1024} /></Button>)}</div>}
              <div className="personal-post-actions"><Button variant="ghost" aria-label="Appreciate story" aria-pressed={!!liked[`${viewer}:${p.id}`]} disabled={!demoCanInteract(viewer, p)} onClick={() => setLiked(v => ({ ...v, [`${viewer}:${p.id}`]: !v[`${viewer}:${p.id}`] }))}><Sparkles />{p.appreciations + (liked[`${viewer}:${p.id}`] ? 1 : 0)}</Button><Button variant="ghost" aria-label="Open conversation" disabled={!demoCanInteract(viewer, p)} onClick={() => open('Conversation', p)}><MessageCircle />{p.comments + (comments[p.id]?.length ?? 0)}</Button><Button variant="ghost" aria-label="Repost" disabled={!demoCanRepost(viewer, p)} onClick={() => open('Repost story', p)}><Repeat2 /></Button><Button variant="ghost" aria-label="Share" disabled={p.audience !== 'public'} onClick={() => open('Share story', p)}><Share2 /></Button></div>
            </article>)}
            {!posts.length && <div className="personal-empty"><Lock /><h3>Nothing shared with this viewer.</h3></div>}
          </div>
        </>}
        {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{draft.bio}</p>{draft.location && <p>{draft.location}</p>}<p className="text-sm text-muted-foreground">Email, phone, address and payment details are never shown on a personal profile.</p></section>}
        {tab === 'Photos' && <><h2>Life through a lens.</h2><div className="personal-gallery">{images.map(im => <Button variant="ghost" key={im.key} onClick={() => setPhoto(im.src)}><img src={im.src} alt="Demo gallery photo" /></Button>)}</div>{!images.length && <p className="py-10 text-muted-foreground">No photos shared with this viewer.</p>}</>}
        {tab === 'Videos' && <><h2>Moving moments.</h2><div className="personal-gallery">{posts.filter(p => p.kind === 'video').map(p => <article key={p.id}><Button variant="ghost" aria-label="Open video storyboard" onClick={() => open('Video storyboard', p)}>{p.photos[0] ? <img src={PHOTOS[p.photos[0]]} alt="Demo video storyboard thumbnail" /> : <Video />}</Button><h3><Video className="inline size-4" /> {p.caption}</h3></article>)}</div></>}
        {tab === 'Collectibles' && <><h2>Showcase.</h2><p className="text-sm text-muted-foreground">Only cards the owner explicitly shared appear here. Private cards are never shown — not even in this owner preview.</p><div className="personal-gallery">{cards.map(c => <article key={c.id}><img src={PHOTOS[c.photo]} alt={c.name} /><h3>{c.name}</h3><span className="text-xs text-muted-foreground">{c.set} · {AUDIENCE_LABEL[c.audience]}</span></article>)}</div>{!cards.length && <p className="py-10 text-muted-foreground">No collectibles shared with this viewer.</p>}</>}
        {tab === 'Activity' && <><h2>Recent chapters.</h2>{posts.map(p => <p key={p.id} className="personal-activity">{p.kind === 'collectible' ? 'Shared a collectible' : 'Shared a story'} · {new Date(p.date).toLocaleDateString()}</p>)}</>}
      </section><aside className="personal-aside"><span className="personal-eyebrow">SEPARATE DESTINATIONS</span><h3>Curiosity is the collection.</h3><p>Your profile is for stories. Shopping and private collection management live in their own places.</p><div className="personal-separate-links"><Button variant="link" asChild><Link to="/sell">Seller hub (commerce) <ArrowUpRight /></Link></Button><Button variant="link" asChild><Link to="/vault">Collector Vault (private) <ArrowUpRight /></Link></Button></div>{owner && <Button variant="outline" onClick={() => setAccountOpen(true)}><Settings />Account & security</Button>}</aside></div>
    </main>
    <Dialog open={!!dialog} onOpenChange={v => { if (!v) setDialog(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>{dialog}</DialogTitle><DialogDescription>Demonstration only. Nothing here changes any account or saved data.</DialogDescription>
      {dialog === 'Edit personal profile' && <><label>Display name<Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Bio<Textarea value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></label><label>Location<Input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label><Button onClick={() => setDialog(null)}>Done</Button></>}
      {composer && owner && <><label>Your story<Textarea value={caption} onChange={e => setCaption(e.target.value)} /></label><label>Who can see this<select className="w-full rounded-md border bg-background p-2" value={audience} onChange={e => setAudience(e.target.value as DemoAudience)}>{Object.entries(AUDIENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>{dialog !== 'Edit story' && <div className="grid grid-cols-2 gap-2">{(Object.keys(PHOTOS) as DemoPhoto[]).map(ph => <Button key={ph} variant={selectedPhotos.includes(ph) ? 'default' : 'outline'} aria-pressed={selectedPhotos.includes(ph)} onClick={() => setSelectedPhotos(v => v.includes(ph) ? v.filter(x => x !== ph) : [...v, ph])}>{ph}</Button>)}</div>}{dialog === 'Video story' && <p className="text-sm text-muted-foreground">Demo storyboard only; no video upload or playback.</p>}<Button disabled={!caption.trim() || (['Photo story', 'Video story', 'Collectible story'].includes(dialog ?? '') && !selectedPhotos.length)} onClick={submit}><Send />{dialog === 'Edit story' ? 'Save demo changes' : 'Add demo story'}</Button></>}
      {dialog === 'Manage story' && story && <><Button variant="outline" onClick={() => setDialog('Edit story')}><Pencil />Edit</Button><Button variant="outline" onClick={() => { setPinned(story.id); setDialog(null); }}><Pin />Pin to top</Button><Button variant="outline" onClick={() => { setHidden(v => [...v, story.id]); setDialog(null); }}><Trash2 />Remove from demo</Button></>}
      {(dialog === 'Profile photo' || dialog === 'Cover photos') && owner && <><div className="grid grid-cols-2 gap-2">{(Object.keys(PHOTOS) as DemoPhoto[]).map(ph => <Button key={ph} variant="outline" className="h-auto flex-col p-2" onClick={() => { if (dialog === 'Profile photo') setPortrait(ph); else setCover([coverShowcase, PHOTOS[ph], community]); setDialog(null); }}><img className="aspect-square w-full object-cover" src={PHOTOS[ph]} alt={PHOTO_LABELS[ph]} />{ph}</Button>)}</div><Button variant="outline" onClick={() => { if (dialog === 'Profile photo') setPortrait(null); else setCover([coverShowcase, grading, community]); setDialog(null); }}>Restore approved reference</Button></>}
      {(dialog === 'Followers' || dialog === 'Following') && <ul className="space-y-3">{['Jordan Demo · card-show regular', 'Morgan Demo · fantasy-art collector', 'Sam Demo · binder curator'].map(n => <li key={n}>{n}</li>)}</ul>}
      {dialog === 'Conversation' && story && demoCanInteract(viewer, story) && <><p className="text-sm">{story.caption}</p><p className="text-xs text-muted-foreground">{story.comments} sample comments counted; the original thread is not supplied.</p>{(comments[story.id] ?? []).map((c, i) => <p key={i}><strong>{c.author}</strong>: {c.text}</p>)}<label>Demo comment<Textarea value={comment} onChange={e => setComment(e.target.value)} /></label><Button disabled={!comment.trim()} onClick={() => { if (!demoCanInteract(viewer, story)) return; setComments(v => ({ ...v, [story.id]: [...(v[story.id] ?? []), { author: viewerLabel, text: comment.trim() }] })); setComment(''); }}><Send />Add demo comment</Button></>}
      {dialog === 'Repost story' && story && demoCanRepost(viewer, story) && <><p>{story.caption}</p><Button onClick={() => { setLocal(v => [{ ...story, id: `draft-${crypto.randomUUID()}`, date: new Date().toISOString().slice(0, 10), caption: `Demo repost · ${story.caption}`, appreciations: 0, comments: 0 }, ...v]); setDialog(null); }}><Repeat2 />Repost to demo timeline</Button></>}
      {(dialog === 'Share profile' || dialog === 'Share story') && <><Input aria-label="Preview link" readOnly value={`${typeof window === 'undefined' ? '' : window.location.origin}/preview/personal-profile?view=visitor`} /><Button onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/preview/personal-profile?view=visitor`); setNotice('Preview link copied. Session-only demo stories are not included.'); } catch { setNotice('Select and copy the preview link above.'); } }}><Share2 />Copy preview link</Button><p role="status" className="text-sm text-muted-foreground">{notice || 'Only the demonstration profile is shared, never private story content.'}</p></>}
      {dialog === 'Video storyboard' && story && <><p>{story.caption}</p><p className="text-sm text-muted-foreground">Demonstration storyboard — not a playable recording.</p>{story.photos.map((ph, i) => <img key={i} src={PHOTOS[ph]} alt={PHOTO_LABELS[ph]} />)}</>}
    </DialogContent></Dialog>
    <Dialog open={!!photo} onOpenChange={v => { if (!v) setPhoto(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>Photo</DialogTitle><DialogDescription>Demonstration photo</DialogDescription>{photo && <img src={photo} alt="Expanded demo photo" className="max-h-[65vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></AppShell>;
}
