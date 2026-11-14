import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera, Pencil, Settings, ArrowUpRight, ImagePlus, Video, Gem, Sparkles, MessageCircle, Repeat2, Share2, Lock, MoreHorizontal, Pin, Trash2, Send, FlaskConical } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PERSONAL_PROFILE_TABS, type PersonalProfileTab } from '@/lib/personalProfilePreview';
import { AUDIENCE_LABEL, DEMO_PROFILE, DEMO_VIEWERS, visiblePosts, showcaseCards, type DemoAudience, type DemoPhoto, type DemoPost, type DemoViewer } from '@/lib/personalProfileDemo';
import outdoors from '@/assets/departments/garden_outdoors.webp';
import collectibles from '@/assets/departments/collectibles.webp';
import gaming from '@/assets/departments/gaming.webp';
import detail from '@/assets/departments/collectibles-detail.webp';
import music from '@/assets/departments/music.webp';
const PHOTOS: Record<DemoPhoto, string> = { outdoors, collectibles, gaming, detail, music };

export function PersonalProfilePreview({ account, initialVisitor = false, routeLabel }: { account: ReactNode; initialVisitor?: boolean; routeLabel?: string }) {
  const [tab, setTab] = useState<PersonalProfileTab>('Posts');
  const [accountOpen, setAccountOpen] = useState(false);
  const [viewer, setViewer] = useState<DemoViewer>(initialVisitor ? 'guest' : 'owner');
  const [draft, setDraft] = useState({ name: DEMO_PROFILE.name, bio: DEMO_PROFILE.bio, location: DEMO_PROFILE.location });
  const [dialog, setDialog] = useState<string | null>(null);
  const [story, setStory] = useState<DemoPost | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [local, setLocal] = useState<DemoPost[]>([]);
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
  const posts = visiblePosts(viewer, [...local, ...visiblePosts('owner')]).filter(p => !hidden.includes(p.id)).sort((a, b) => a.id === pinned ? -1 : b.id === pinned ? 1 : 0);
  const cards = showcaseCards(viewer);
  const images = posts.flatMap(p => p.photos.map((ph, i) => ({ key: `${p.id}-${i}`, src: PHOTOS[ph] })));
  const open = (t: string, s?: DemoPost) => { setDialog(t); setStory(s ?? null); setCaption(s?.caption ?? ''); setAudience(s?.audience ?? 'only_me'); };
  const submit = () => {
    if (!caption.trim()) return;
    setLocal(v => [{ id: `draft-${Date.now()}`, kind: 'story', caption: caption.trim(), photos: [], audience, date: new Date().toISOString().slice(0, 10), appreciations: 0, comments: 0 }, ...v]);
    setDialog(null);
  };
  const viewerLabel = DEMO_VIEWERS.find(v => v.id === viewer)!.label;
  return <AppShell><div className="personal-profile-theme" data-profile-component="PersonalProfilePreview" data-demo-viewer={viewer}>
    <div className="personal-review"><div><strong className="personal-preview-label">PREVIEW DESIGN</strong><strong className="personal-preview-label"><FlaskConical className="inline size-3" /> DEMONSTRATION DATA</strong>{routeLabel && <code data-preview-route>{routeLabel}</code>}<span>{owner ? 'Owner view · demo profile, no customer data' : `SIMULATED ${viewerLabel.toUpperCase()} VIEW · not real visitor access`}</span></div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Simulate viewer">{DEMO_VIEWERS.map(v => <Button key={v.id} size="sm" variant={viewer === v.id ? 'default' : 'outline'} aria-pressed={viewer === v.id} onClick={() => setViewer(v.id)}>{v.label}</Button>)}</div></div>
    <main className="personal-page">
      <section className="personal-masthead">
        <div className="personal-identity">
          <div className="personal-portrait"><span>{draft.name.slice(0, 1)}</span>{owner && <Button size="icon" aria-label="Change profile photo" onClick={() => open('Profile photo')}><Camera /></Button>}</div>
          <div className="personal-name"><h1>{draft.name}<em>.</em></h1><p>@{DEMO_PROFILE.username} · demo</p></div>
          <p className="personal-bio">{draft.bio}{draft.location && <><br /><span>{draft.location}</span></>}</p>
          <div className="personal-counts"><Button variant="ghost" onClick={() => open('Followers')}><strong>{DEMO_PROFILE.followers.toLocaleString()}</strong><span>Followers</span></Button><Button variant="ghost" onClick={() => open('Following')}><strong>{DEMO_PROFILE.following}</strong><span>Following</span></Button></div>
          <div className="personal-identity-actions">{owner ? <><Button onClick={() => open('Edit personal profile')}><Pencil />Edit profile</Button><Button variant="outline" aria-label="Account settings" title="Account settings" onClick={() => setAccountOpen(true)}><Settings /></Button></> : <Button variant="outline" onClick={() => open('Follow')}>Follow</Button>}<Button variant="outline" aria-label="Share profile" onClick={() => open('Share profile')}><Share2 /></Button></div>
        </div>
        <div className="personal-cover"><img src={outdoors} alt="Demo cover: outdoors" /><img src={collectibles} alt="Demo cover: collection" /><img src={gaming} alt="Demo cover: arcade" /><div className="personal-cover-caption"><span>PERSONAL JOURNAL / 01</span><h2>Stories worth keeping.</h2></div>{owner && <Button variant="outline" size="icon" aria-label="Change cover" onClick={() => open('Cover photos')}><Camera /></Button>}</div>
      </section>
      <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t, i) => <Button key={t} variant="ghost" aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}><span>0{i + 1}</span>{t}</Button>)}</nav>
      <div className="personal-body"><section className="personal-timeline">
        {tab === 'Posts' && <>
          {owner && <div className="personal-composer"><Button variant="ghost" className="personal-prompt" onClick={() => open('Create a story')}>What’s your latest story?</Button><Button variant="ghost" size="icon" aria-label="Add photos" onClick={() => open('Photo story')}><ImagePlus /></Button><Button variant="ghost" size="icon" aria-label="Add video" onClick={() => open('Video story')}><Video /></Button><Button variant="ghost" size="icon" aria-label="Share collectible" onClick={() => open('Collectible story')}><Gem /></Button></div>}
          <div className="personal-section-heading"><h2>The latest chapter.</h2><span>{posts.length} visible to {owner ? 'you' : viewerLabel.toLowerCase()}</span></div>
          <div className="personal-post-grid">
            {posts.map((p, i) => <article key={p.id} className={`personal-post ${p.photos.length ? 'photo-story' : 'note-story'} ${i === 0 ? 'lead-story' : ''}`}>
              <div className="personal-post-meta"><span>{pinned === p.id && <Pin size={13} />}{p.kind === 'video' ? 'Video · ' : p.kind === 'collectible' ? 'Collectible · ' : ''}<Lock className="inline size-3" /> {AUDIENCE_LABEL[p.audience]}{p.id.startsWith('draft-') && ' · draft'}</span>{owner && <Button variant="ghost" size="icon" aria-label="Manage story" onClick={() => open('Manage story', p)}><MoreHorizontal /></Button>}</div>
              <p className="personal-author">@{DEMO_PROFILE.username} <span>{new Date(p.date).toLocaleDateString()}</span></p>
              <p className="personal-story-caption">{p.caption}</p>
              {p.photos.length > 0 && <div className={p.photos.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>{p.photos.map((ph, j) => <Button key={j} variant="ghost" className="personal-story-media" onClick={() => setPhoto(PHOTOS[ph])}><img src={PHOTOS[ph]} alt="Demo story photo" /></Button>)}</div>}
              <div className="personal-post-actions"><Button variant="ghost" aria-pressed={!!liked[p.id]} disabled={viewer === 'guest'} onClick={() => setLiked(v => ({ ...v, [p.id]: !v[p.id] }))}><Sparkles />{p.appreciations + (liked[p.id] ? 1 : 0)}</Button><Button variant="ghost" disabled={viewer === 'guest'} onClick={() => open('Conversation', p)}><MessageCircle />{p.comments}</Button><Button variant="ghost" aria-label="Repost" disabled={p.audience !== 'public' || viewer === 'guest'} onClick={() => open('Repost story', p)}><Repeat2 /></Button><Button variant="ghost" aria-label="Share" disabled={p.audience !== 'public'} onClick={() => open('Share story', p)}><Share2 /></Button></div>
            </article>)}
            {!posts.length && <div className="personal-empty"><Lock /><h3>Nothing shared with this viewer.</h3></div>}
          </div>
        </>}
        {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{draft.bio}</p>{draft.location && <p>{draft.location}</p>}<p className="text-sm text-muted-foreground">Email, phone, address and payment details are never shown on a personal profile.</p></section>}
        {tab === 'Photos' && <><h2>Life through a lens.</h2><div className="personal-gallery">{images.map(im => <Button variant="ghost" key={im.key} onClick={() => setPhoto(im.src)}><img src={im.src} alt="Demo gallery photo" /></Button>)}</div>{!images.length && <p className="py-10 text-muted-foreground">No photos shared with this viewer.</p>}</>}
        {tab === 'Videos' && <><h2>Moving moments.</h2><div className="personal-gallery">{posts.filter(p => p.kind === 'video').map(p => <article key={p.id}><img src={PHOTOS[p.photos[0]]} alt="Demo video thumbnail" /><h3><Video className="inline size-4" /> {p.caption}</h3></article>)}</div></>}
        {tab === 'Collectibles' && <><h2>Showcase.</h2><p className="text-sm text-muted-foreground">Only cards the owner explicitly shared appear here. Private cards are never shown — not even in this owner preview.</p><div className="personal-gallery">{cards.map(c => <article key={c.id}><img src={PHOTOS[c.photo]} alt={c.name} /><h3>{c.name}</h3><span className="text-xs text-muted-foreground">{c.set} · {AUDIENCE_LABEL[c.audience]}</span></article>)}</div>{!cards.length && <p className="py-10 text-muted-foreground">No collectibles shared with this viewer.</p>}</>}
        {tab === 'Activity' && <><h2>Recent chapters.</h2>{posts.map(p => <p key={p.id} className="personal-activity">{p.kind === 'collectible' ? 'Shared a collectible' : 'Shared a story'} · {new Date(p.date).toLocaleDateString()}</p>)}</>}
      </section><aside className="personal-aside"><span className="personal-eyebrow">SEPARATE DESTINATIONS</span><h3>Curiosity is the collection.</h3><p>Your profile is for stories. Shopping and private collection management live in their own places.</p><div className="personal-separate-links"><Button variant="link" asChild><Link to="/sell">Seller hub (commerce) <ArrowUpRight /></Link></Button><Button variant="link" asChild><Link to="/vault">Collector Vault (private) <ArrowUpRight /></Link></Button></div>{owner && <Button variant="outline" onClick={() => setAccountOpen(true)}><Settings />Account & security</Button>}</aside></div>
    </main>
    <Dialog open={!!dialog} onOpenChange={v => { if (!v) setDialog(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>{dialog}</DialogTitle><DialogDescription>Demonstration only. Nothing here changes any account or saved data.</DialogDescription>
      {dialog === 'Edit personal profile' && <><label>Display name<Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Bio<Textarea value={draft.bio} onChange={e => setDraft({ ...draft, bio: e.target.value })} /></label><label>Location<Input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label><Button onClick={() => setDialog(null)}>Done</Button></>}
      {(dialog === 'Create a story' || dialog === 'Edit story') && <><label>Your story<Textarea value={caption} onChange={e => setCaption(e.target.value)} /></label><label>Who can see this<select className="w-full rounded-md border bg-background p-2" value={audience} onChange={e => setAudience(e.target.value as DemoAudience)}>{Object.entries(AUDIENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label><Button disabled={!caption.trim()} onClick={submit}><Send />Add demo story</Button></>}
      {dialog === 'Manage story' && story && <><Button variant="outline" onClick={() => setDialog('Edit story')}><Pencil />Edit</Button><Button variant="outline" onClick={() => { setPinned(story.id); setDialog(null); }}><Pin />Pin to top</Button><Button variant="outline" onClick={() => { setHidden(v => [...v, story.id]); setDialog(null); }}><Trash2 />Remove from demo</Button></>}
      {!['Edit personal profile', 'Create a story', 'Edit story', 'Manage story'].includes(dialog ?? '') && <p className="text-sm text-muted-foreground">This action is shown for design review and stays inactive until privacy safeguards are approved.</p>}
    </DialogContent></Dialog>
    <Dialog open={!!photo} onOpenChange={v => { if (!v) setPhoto(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>Photo</DialogTitle><DialogDescription>Demonstration photo</DialogDescription>{photo && <img src={photo} alt="Expanded demo photo" className="max-h-[65vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></AppShell>;
}
