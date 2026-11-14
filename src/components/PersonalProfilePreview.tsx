import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Pencil, Settings, ArrowUpRight, ImagePlus, Video, Gem, Sparkles, MessageCircle, Repeat2, Share2, Lock, MoreHorizontal, Pin, Trash2, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PERSONAL_PROFILE_TABS, canReadPersonalTimeline, personalDraftKey, type PersonalProfileTab } from '@/lib/personalProfilePreview';
import cityCover from '@/assets/departments/garden_outdoors.webp';
import collectionCover from '@/assets/departments/collectibles.webp';
import gamingCover from '@/assets/departments/gaming.webp';
type Draft = { name: string; bio: string; location: string; avatar?: string; cover?: string; text?: string };
type Story = { id: string; caption: string; image_url: string | null; created_at: string; visibility: string; allow_comments: boolean };

export function PersonalProfilePreview({ account }: { account: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<PersonalProfileTab>('Posts');
  const [accountOpen, setAccountOpen] = useState(false);
  const [visitor, setVisitor] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: '', bio: '', location: '' });
  const [dialog, setDialog] = useState<string | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [localStories, setLocalStories] = useState<Story[]>([]);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [localReactions, setLocalReactions] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState('');
  const ownerId = user?.id;
  useEffect(() => {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(font);
    return () => font.remove();
  }, []);
  useEffect(() => {
    setLocalStories([]); setHidden([]); setPinned(null); setLocalReactions({});
    setDraft({ name: '', bio: '', location: '' });
    if (!ownerId) return;
    try { const value = sessionStorage.getItem(personalDraftKey(ownerId)); if (value) setDraft(JSON.parse(value)); } catch { /* tab-local draft unavailable */ }
  }, [ownerId]);
  const query = useQuery({
    queryKey: ['personal-profile-owner-preview', ownerId],
    enabled: !!ownerId && !visitor,
    retry: false,
    queryFn: async () => {
      if (!ownerId || !canReadPersonalTimeline(user?.id, ownerId)) throw new Error('Owner access required');
      const [posts, cards, followers, following] = await Promise.all([
        supabase.from('posts').select('id,caption,image_url,created_at,visibility,allow_comments').eq('user_id', ownerId).order('created_at', { ascending: false }).limit(40),
        supabase.from('vault_cards').select('id,name,image_url,visibility').eq('user_id', ownerId).order('created_at', { ascending: false }).limit(9),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', ownerId),
        supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', ownerId),
      ]);
      if (posts.error || cards.error || followers.error || following.error) throw new Error('Your profile could not be loaded. Please retry.');
      return { posts: posts.data, cards: cards.data, followers: followers.count, following: following.count };
    },
  });
  function saveDraft(value: Draft) {
    setDraft(value);
    if (ownerId) try { sessionStorage.setItem(personalDraftKey(ownerId), JSON.stringify(value)); } catch { /* in-memory preview remains */ }
  }
  async function selectImage(file: File | undefined, target: 'avatar' | 'cover') {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { setUploadError('Choose a JPEG, PNG or WebP image under 4 MB.'); return; }
    const value = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(); reader.onerror = reject; reader.readAsDataURL(file); });
    saveDraft({ ...draft, [target]: value }); setUploadError('');
  }
  if (accountOpen) return <><div className="personal-profile-back"><Button variant="outline" onClick={() => setAccountOpen(false)}>← Personal profile</Button></div>{account}</>;
  if (loading) return <AppShell><p className="p-10 text-center text-muted-foreground">Loading your profile…</p></AppShell>;
  if (!user) return <AppShell><section className="mx-auto max-w-lg px-6 py-20 text-center"><h1 className="text-3xl">Your personal profile</h1><p className="my-5 text-muted-foreground">Sign in to open your personal timeline.</p><Button asChild><Link to="/auth">Sign in</Link></Button></section></AppShell>;
  const posts = visitor ? [] : [...localStories, ...(query.data?.posts ?? [])].filter(p => !hidden.includes(p.id)).sort((a, b) => a.id === pinned ? -1 : b.id === pinned ? 1 : 0);
  const cards = visitor ? [] : query.data?.cards ?? [];
  const images = posts.filter(p => p.image_url);
  const name = draft.name || profile?.username || 'Your profile';
  function open(title: string, selected?: Story) { setDialog(title); setStory(selected ?? null); setCaption(selected?.caption ?? draft.text ?? ''); }
  function submitStory() {
    if (!caption.trim()) return;
    if (story) setLocalStories(prev => [{ ...story, id: `draft-${Date.now()}`, caption: caption.trim() }, ...prev]);
    else setLocalStories(prev => [{ id: `draft-${Date.now()}`, caption: caption.trim(), image_url: null, created_at: new Date().toISOString(), visibility: 'only_me', allow_comments: true }, ...prev]);
    setDialog(null); saveDraft({ ...draft, text: '' });
  }
  return <AppShell><div className="personal-profile-theme">
    <div className="personal-review"><span>{visitor ? 'Visitor simulation · No other account is opened' : 'Preview only · Draft changes stay in this browser tab'}</span><Button variant="outline" size="sm" onClick={() => setVisitor(v => !v)}>{visitor ? 'Owner view' : 'Visitor view'}</Button></div>
    <main className="personal-page">
      <section className="personal-masthead">
        <div className="personal-identity">
          <div className="personal-portrait">{draft.avatar || profile?.avatar_url ? <img src={draft.avatar || profile?.avatar_url || ''} alt={name} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}{!visitor && <Button size="icon" title="Change profile photo" aria-label="Change profile photo" onClick={() => open('Profile photo')}><Camera /></Button>}</div>
          <div className="personal-name"><h1>{name}<em>.</em></h1><p>@{profile?.username}</p></div>
          <p className="personal-bio">{draft.bio || 'Your stories. Your discoveries. Your world.'}{draft.location && <><br /><span>{draft.location}</span></>}</p>
          {!visitor && <div className="personal-counts"><Button variant="ghost" onClick={() => open('Followers')}><strong>{query.data?.followers ?? '—'}</strong><span>Followers</span></Button><Button variant="ghost" onClick={() => open('Following')}><strong>{query.data?.following ?? '—'}</strong><span>Following</span></Button></div>}
          <div className="personal-identity-actions">{!visitor ? <><Button onClick={() => open('Edit personal profile')}><Pencil />Edit profile</Button><Button variant="outline" aria-label="Private account tools" title="Private account tools" onClick={() => setAccountOpen(true)}><Settings /></Button></> : <Button variant="outline" disabled><Lock />Visitor preview</Button>}<Button variant="outline" title="Share profile" aria-label="Share profile" onClick={() => open('Share profile')}><Share2 /></Button></div>
        </div>
        <div className="personal-cover"><img src={draft.cover || cityCover} alt="Personal cover preview" /><img src={collectionCover} alt="Collectible cover preview" /><img src={gamingCover} alt="Gaming cover preview" /><div className="personal-cover-caption"><span>PERSONAL JOURNAL / 01</span><h2>Stories worth keeping.</h2></div>{!visitor && <Button variant="outline" size="icon" aria-label="Change cover" title="Change cover" onClick={() => open('Cover photos')}><Camera /></Button>}</div>
      </section>
      <nav className="personal-tabs" aria-label="Personal profile sections">{PERSONAL_PROFILE_TABS.map((t, i) => <Button key={t} variant="ghost" aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}><span>0{i + 1}</span>{t}</Button>)}</nav>
      <div className="personal-body"><section className="personal-timeline">
        {tab === 'Posts' && <>
          {!visitor && <div className="personal-composer"><Button variant="ghost" className="personal-prompt" onClick={() => open('Create a story')}>What’s your latest story?</Button><Button variant="ghost" size="icon" title="Add photos" aria-label="Add photos" onClick={() => open('Photo story')}><ImagePlus /></Button><Button variant="ghost" size="icon" title="Add video" aria-label="Add video" onClick={() => open('Video story')}><Video /></Button><Button variant="ghost" size="icon" title="Share collectible" aria-label="Share collectible" onClick={() => open('Collectible story')}><Gem /></Button></div>}
          <div className="personal-section-heading"><h2>The latest chapter.</h2><span>Newest first ↓</span></div>
          {visitor ? <div className="personal-empty"><Lock /><h3>Public timeline unavailable</h3><p>Visitor content remains unavailable until the privacy review is approved.</p></div> : query.isError ? <div className="personal-empty"><p>Your timeline couldn’t be loaded.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> : query.isPending ? <p className="py-10 text-muted-foreground">Loading your stories…</p> : <div className="personal-post-grid">
            {posts.map((p, index) => <article key={p.id} className={`personal-post ${p.image_url ? 'photo-story' : 'note-story'} ${index === 0 ? 'lead-story' : ''}`}>
              <div className="personal-post-meta"><span>{pinned === p.id && <Pin size={13} />}{p.id.startsWith('draft-') ? 'Browser draft · Only you' : `Your story · ${p.visibility}`}</span><Button variant="ghost" size="icon" aria-label="Manage story" onClick={() => open('Manage story', p)}><MoreHorizontal /></Button></div>
              <p className="personal-author">@{profile?.username} <span>{new Date(p.created_at).toLocaleDateString()}</span></p>
              <p className="personal-story-caption">{p.caption}</p>{p.image_url && <Button variant="ghost" className="personal-story-media" onClick={() => setPhoto(p.image_url)}><img src={p.image_url} alt="Your story photograph" /></Button>}
              <div className="personal-post-actions"><Button variant="ghost" onClick={() => { setStory(p); setLocalReactions(v => ({ ...v, [p.id]: !v[p.id] })); }} title="Preview appreciation" aria-pressed={!!localReactions[p.id]}><Sparkles />{localReactions[p.id] ? 'Appreciated · Draft' : 'Appreciate'}</Button><Button variant="ghost" title="Comments" onClick={() => open('Conversation', p)}><MessageCircle /></Button><Button variant="ghost" title="Repost" onClick={() => open('Repost story', p)}><Repeat2 /></Button><Button variant="ghost" title="Share" onClick={() => open('Share story', p)}><Share2 /></Button></div>
            </article>)}
            {cards[0] && <article className="personal-post personal-collectible"><span className="personal-eyebrow">FROM YOUR COLLECTION · OWNER ONLY</span>{cards[0].image_url && <img src={cards[0].image_url} alt={cards[0].name} />}<h3>{cards[0].name}</h3><Button variant="link" asChild><Link to="/vault">Open your Vault <ArrowUpRight /></Link></Button></article>}
            {!posts.length && <div className="personal-empty"><Sparkles /><h3>A new chapter starts here.</h3><p>No stories yet.</p><Button variant="outline" onClick={() => open('Create a story')}>Create a browser draft</Button></div>}
          </div>}
        </>}
        {tab === 'About' && <section className="personal-about"><h2>The person behind the pulls.</h2><p>{draft.bio || 'Add your personal story with Edit profile.'}</p>{draft.location && <p>{draft.location}</p>}<p>@{profile?.username}</p></section>}
        {tab === 'Photos' && <><h2>Life through a lens.</h2><div className="personal-gallery">{images.map(p => <Button variant="ghost" key={p.id} onClick={() => setPhoto(p.image_url)}><img src={p.image_url || ''} alt="Your story photo" /></Button>)}</div>{!images.length && <p className="py-10 text-muted-foreground">{visitor ? 'Public photos are not available yet.' : 'No story photos yet.'}</p>}</>}
        {tab === 'Videos' && <><h2>Moving moments.</h2><div className="personal-empty"><Video /><p>Video stories are not connected yet.</p></div></>}
        {tab === 'Collectibles' && <><h2>Chosen to share.</h2><div className="personal-gallery">{cards.map(c => <article key={c.id}>{c.image_url && <img src={c.image_url} alt={c.name} />}<h3>{c.name}</h3><span className="text-xs text-muted-foreground">Owner only · {c.visibility}</span></article>)}</div>{!cards.length && <p className="py-10 text-muted-foreground">No collectible highlights available.</p>}</>}
        {tab === 'Activity' && <><h2>Recent chapters.</h2>{posts.map(p => <p key={p.id} className="personal-activity">{p.id.startsWith('draft-') ? 'Drafted a story' : 'Shared a story'} · {new Date(p.created_at).toLocaleDateString()}</p>)}{!posts.length && <p className="py-10 text-muted-foreground">No activity available.</p>}</>}
      </section><aside className="personal-aside"><span className="personal-eyebrow">THE PERSON BEHIND THE PULLS</span><h3>Curiosity is the collection.</h3><p>{draft.bio || 'A place for the things and moments that matter to you.'}</p><div className="personal-separate-links">{profile?.username && <Button variant="link" asChild><Link to="/seller/$username" params={{ username: profile.username }}>Seller storefront <ArrowUpRight /></Link></Button>}<Button variant="link" asChild><Link to="/vault">Personal Vault <ArrowUpRight /></Link></Button></div>{!visitor && <Button variant="outline" onClick={() => setAccountOpen(true)}><Settings />Account & security</Button>}</aside></div>
    </main>
    <Dialog open={!!dialog} onOpenChange={v => { if (!v) setDialog(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>{dialog}</DialogTitle><DialogDescription>Preview only. Nothing here changes your account or the database.</DialogDescription>
      {dialog === 'Edit personal profile' && <><label>Display name<Input value={draft.name} placeholder={profile?.username} onChange={e => saveDraft({ ...draft, name: e.target.value })} /></label><label>Bio<Textarea value={draft.bio} onChange={e => saveDraft({ ...draft, bio: e.target.value })} /></label><label>Optional personal location<Input value={draft.location} onChange={e => saveDraft({ ...draft, location: e.target.value })} /></label><Button onClick={() => setDialog(null)}>Keep browser draft</Button></>}
      {(dialog === 'Profile photo' || dialog === 'Cover photos') && <><label>Select a browser-only photo<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void selectImage(e.target.files?.[0], dialog === 'Profile photo' ? 'avatar' : 'cover'); }} /></label>{uploadError && <p className="text-destructive">{uploadError}</p>}<Button variant="outline" onClick={() => saveDraft({ ...draft, [dialog === 'Profile photo' ? 'avatar' : 'cover']: undefined })}>Reset draft photo</Button></>}
      {(dialog === 'Create a story' || dialog === 'Edit story') && <><label>Your story<Textarea value={caption} onChange={e => { setCaption(e.target.value); saveDraft({ ...draft, text: e.target.value }); }} /></label><p className="text-sm text-muted-foreground"><Lock className="inline size-4" />Only you · Browser draft</p><Button disabled={!caption.trim()} onClick={submitStory}><Send />Keep browser draft</Button></>}
      {dialog === 'Manage story' && story && <><Button variant="outline" onClick={() => setDialog('Edit story')}><Pencil />Edit as browser draft</Button><Button variant="outline" onClick={() => { setPinned(story.id); setDialog(null); }}><Pin />Pin in this preview</Button><Button variant="outline" onClick={() => setDialog('Story privacy')}><Lock />Privacy</Button><Button variant="outline" onClick={() => { setHidden(v => [...v, story.id]); setDialog(null); }}><Trash2 />Hide in this preview</Button><Button variant="link" asChild><Link to="/feed">Manage existing posts in Feed <ArrowUpRight /></Link></Button></>}
      {!['Edit personal profile', 'Profile photo', 'Cover photos', 'Create a story', 'Edit story', 'Manage story'].includes(dialog ?? '') && <p className="text-sm text-muted-foreground">{dialog === 'Followers' ? `${query.data?.followers ?? '—'} followers.` : dialog === 'Following' ? `${query.data?.following ?? '—'} following.` : 'This feature remains inactive pending the separately approved social privacy and media work.'}</p>}
    </DialogContent></Dialog>
    <Dialog open={!!photo} onOpenChange={v => { if (!v) setPhoto(null); }}><DialogContent className="personal-profile-theme personal-dialog"><DialogTitle>Story photograph</DialogTitle><DialogDescription>Owner-only photo preview</DialogDescription>{photo && <img src={photo} alt="Expanded story photograph" className="max-h-[65vh] w-full object-contain" />}</DialogContent></Dialog>
  </div></AppShell>;
}