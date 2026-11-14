import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, ShieldCheck, Users } from 'lucide-react';
import cardArt from '@/assets/departments/collectibles.webp';
import { CARD_AUDIENCES, applySelectedPrivacy, selectedShowCards, type CardAudience, type PrivacyCard, type ShowRole } from '@/lib/vaultPrivacyPreview';
const labels: Record<CardAudience, string> = { private: 'Only me', followers: 'Followers', friends: 'Close friends', public: 'Public', inherit: 'Use Vault setting' };
export function VaultPrivacyPreview() {
  const { user, loading } = useAuth();
  const [cards, setCards] = useState<PrivacyCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [audience, setAudience] = useState<CardAudience>('private');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState('Friday collector showcase');
  const [role, setRole] = useState<ShowRole>('host');
  const [consent, setConsent] = useState(false);
  const [showSelection, setShowSelection] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSelected([]); setShowSelection([]); setConsent(false); setCards([]); setStatus('');
    if (!user) {
      if (!loading) setCards([{ id: 'example-1', name: 'Example collectible · 01', visibility: 'private' }, { id: 'example-2', name: 'Example collectible · 02', visibility: 'private' }, { id: 'example-3', name: 'Example collectible · 03', visibility: 'followers' }]);
      return () => { cancelled = true; };
    }
    setPending(true);
    void supabase.from('vault_cards').select('id,name,visibility').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (cancelled) return;
      setPending(false);
      if (error) { setStatus('Your cards could not be loaded. No privacy settings were changed.'); return; }
      setCards(data ?? []);
    });
    return () => { cancelled = true; };
  }, [user?.id, loading]);
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]); }
  function update(ids: string[], value: CardAudience) {
    setCards(current => applySelectedPrivacy(current, ids, value));
    setStatus(`${ids.length} card${ids.length === 1 ? '' : 's'} changed in this preview only. Live privacy is unchanged.`);
  }
  const shared = selectedShowCards(cards, showSelection, role, consent);
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-8" data-vault-privacy-preview>
    <header className="space-y-3"><p className="text-sm font-bold text-primary">PREVIEW DESIGN · VAULT PRIVACY</p><h1 className="text-3xl font-bold">Your collection. Your choice.</h1><p className="text-sm text-muted-foreground">{user ? 'Your Vault · read-only source' : 'Example cards · signed out'} · Changes here are temporary. Nothing is saved to live cards.</p><p className="text-sm"><Lock className="mr-2 inline size-4" />A Public Vault does not make private cards public. The Vault setting remains the maximum audience.</p></header>
    <section className="space-y-4" aria-label="Card privacy">
      <div className="flex flex-wrap items-center gap-3 border-y border-border py-4"><h2 className="mr-auto text-xl font-semibold">Individual card privacy <span className="text-muted-foreground">({cards.length})</span></h2><Button variant="outline" size="sm" onClick={() => setSelected(cards.map(c => c.id))}>Select all</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm">{selected.length} selected</span><select aria-label="Privacy for selected cards" value={audience} onChange={e => setAudience(e.target.value as CardAudience)} className="rounded-md border border-input bg-background p-2 text-sm">{CARD_AUDIENCES.map(v => <option key={v} value={v}>{labels[v]}</option>)}</select><Button disabled={!selected.length} onClick={() => update(selected, audience)}><ShieldCheck />Apply to selected</Button></div>
      {pending && <p role="status">Loading your cards…</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <article key={card.id} className="flex gap-3 rounded-lg border border-border bg-card p-4"><img src={cardArt} alt="Collectible illustration" className="h-24 w-16 rounded object-cover" /><div className="min-w-0 flex-1 space-y-3"><label className="flex items-start gap-2"><Checkbox checked={selected.includes(card.id)} onCheckedChange={() => toggle(card.id)} aria-label={`Select ${card.name}`} /><span className="break-words font-semibold">{card.name}</span></label><select aria-label={`Privacy for ${card.name}`} value={CARD_AUDIENCES.includes(card.visibility as CardAudience) ? card.visibility ?? '' : ''} onChange={e => update([card.id], e.target.value as CardAudience)} className="w-full rounded-md border border-input bg-background p-2 text-sm"><option value="" disabled>Unrecognized setting · preserved</option>{CARD_AUDIENCES.map(v => <option key={v} value={v}>{labels[v]}</option>)}</select></div></article>)}</div>
    </section>
    <section className="space-y-4 border-t border-border pt-6" aria-label="Show collectible selection"><h2 className="text-xl font-semibold">Collectibles for this show</h2><p className="text-sm text-muted-foreground">Temporary show-only selection. Private card settings stay unchanged. Team access below is a simulation, not a live permission.</p><div className="flex flex-wrap gap-3"><label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Show name<input value={show} onChange={e => { setShow(e.target.value); setShowSelection([]); setConsent(false); }} className="rounded-md border border-input bg-background p-2" /></label><label className="flex flex-col gap-1 text-sm">View as<select aria-label="Show role" value={role} onChange={e => setRole(e.target.value as ShowRole)} className="rounded-md border border-input bg-background p-2"><option value="host">Host</option><option value="cohost">Co-host</option><option value="moderator">Moderator</option></select></label></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} />Owner consents to team access for this show only</label><div className="flex flex-wrap gap-3"><Button disabled={!selected.length || !show.trim()} onClick={() => setShowSelection([...selected])}><Users />Use selected for this show</Button><Button variant="outline" onClick={() => { setShowSelection([]); setConsent(false); }}>End show / revoke selection</Button></div><p role="status" className="text-sm">{show || 'Unnamed show'} · {shared.length} collectible{shared.length === 1 ? '' : 's'} visible to {role === 'cohost' ? 'co-host' : role}</p><ul className="space-y-1 text-sm">{shared.map(c => <li key={c.id}>{c.name} · Vault: {labels[c.visibility as CardAudience] ?? 'Preserved'}</li>)}</ul></section>
    {status && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{status}</p>}
  </div>;
}