import { useEffect, useRef, useState } from 'react';
import { Music2, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type FlexSpotlight = { id: string; name: string; category: string; set_guess: string; rarity_vibe: string; image: string; hype_lines: string[] };

const SOUNDS = [
  { key: 'airhorn', label: 'Air horn', emoji: '📯' },
  { key: 'drumroll', label: 'Drumroll', emoji: '🥁' },
  { key: 'applause', label: 'Applause', emoji: '👏' },
  { key: 'wow', label: 'Wooow', emoji: '🤩' },
  { key: 'ding', label: 'Ding!', emoji: '🔔' },
  { key: 'boom', label: 'Boom', emoji: '💥' },
] as const;
type SoundKey = (typeof SOUNDS)[number]['key'];

let ctx: AudioContext | null = null;
function audio() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; }
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sawtooth', vol = 0.15, endFreq?: number) {
  const a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
function noise(start: number, dur: number, vol = 0.2, bursts = 1) {
  const a = audio();
  for (let i = 0; i < bursts; i++) {
    const len = Math.floor(a.sampleRate * 0.06), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / len);
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = vol * (0.5 + Math.random() * 0.5);
    s.connect(g).connect(a.destination); s.start(a.currentTime + start + (dur * i) / bursts + Math.random() * 0.03);
  }
}
/** Synthesized in the browser so no audio files are needed. */
export function playSound(k: SoundKey) {
  try {
    if (k === 'airhorn') { [0, 0.35].forEach(s => { tone(466, s, 0.3, 'sawtooth', 0.12); tone(470, s, 0.3, 'square', 0.06); }); }
    if (k === 'drumroll') { noise(0, 1.2, 0.18, 28); noise(1.25, 0.1, 0.4); tone(110, 1.25, 0.4, 'sine', 0.4, 50); }
    if (k === 'applause') noise(0, 1.6, 0.12, 60);
    if (k === 'wow') { tone(300, 0, 0.5, 'triangle', 0.18, 700); tone(700, 0.5, 0.5, 'triangle', 0.18, 350); }
    if (k === 'ding') { tone(1318, 0, 0.8, 'sine', 0.2); tone(1975, 0.02, 0.6, 'sine', 0.08); }
    if (k === 'boom') { tone(140, 0, 0.7, 'sine', 0.5, 35); noise(0, 0.2, 0.35, 3); }
  } catch { /* audio unavailable */ }
}

/** Fun soundboard for Flex Live. Host plays; every viewer hears it and sees a floating emoji. */
export function FlexSoundboard({ streamId, isHost }: { streamId: string; isHost: boolean }) {
  const [open, setOpen] = useState(false);
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const last = useRef(0);
  const pop = (k: SoundKey) => {
    playSound(k);
    const emoji = SOUNDS.find(s => s.key === k)?.emoji ?? '🎉';
    const f = { id: Date.now() + Math.random(), emoji, x: 10 + Math.random() * 80 };
    setFloats(v => [...v.slice(-8), f]);
    setTimeout(() => setFloats(v => v.filter(x => x.id !== f.id)), 2200);
  };
  useEffect(() => {
    const ch = supabase.channel(`flex-sound-${streamId}`);
    ch.on('broadcast', { event: 'play' }, ({ payload }) => { if (SOUNDS.some(s => s.key === payload?.k)) pop(payload.k); });
    ch.subscribe(); chan.current = ch;
    return () => { chan.current = null; void supabase.removeChannel(ch); };
  }, [streamId]);
  const fire = (k: SoundKey) => {
    if (Date.now() - last.current < 700) return; // keep it fun, not spammy
    last.current = Date.now(); pop(k);
    chan.current?.send({ type: 'broadcast', event: 'play', payload: { k } });
  };
  return <>
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {floats.map(f => <span key={f.id} className="absolute bottom-24 text-5xl animate-[flexfloat_2.2s_ease-out_forwards]" style={{ left: `${f.x}%` }}>{f.emoji}</span>)}
    </div>
    {isHost && <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2">
      {open && <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
        {SOUNDS.map(s => <button key={s.key} type="button" onClick={() => fire(s.key)} className="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-xl bg-muted px-2 py-2 text-[11px] font-bold transition hover:scale-105 hover:bg-primary hover:text-primary-foreground active:scale-95"><span className="text-2xl">{s.emoji}</span>{s.label}</button>)}
      </div>}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg">{open ? <X className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}Soundboard</button>
    </div>}
  </>;
}

/** Host picks one of their Vault items to spotlight on screen (no prices shown). */
export function FlexVaultSpotlightPicker({ onSpotlight }: { onSpotlight: (s: FlexSpotlight) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; name: string; image_url: string | null; category: string | null; tcg_set: string | null }[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open || !user || items) return;
    void supabase.from('vault_cards').select('id,name,image_url,category,tcg_set').eq('user_id', user.id).neq('status', 'sold').order('created_at', { ascending: false }).limit(200).then(({ data }) => setItems((data as any) ?? []));
  }, [open, user, items]);
  const shown = (items ?? []).filter(i => i.name?.toLowerCase().includes(q.toLowerCase()));
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground shadow-lg"><Sparkles className="h-4 w-4" />Flex from Vault</button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-3"><h2 className="font-black">Spotlight a Vault item</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
        <div className="p-3"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your Vault…" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto p-3 pt-0 sm:grid-cols-4">
          {items === null ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Loading your Vault…</p>
            : shown.length === 0 ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{items.length ? 'No matches.' : 'Your Vault is empty — add items to flex them live.'}</p>
            : shown.map(i => <button key={i.id} type="button" onClick={() => { onSpotlight({ id: `vault-${i.id}-${Date.now()}`, name: i.name, category: i.category ?? 'Collection', set_guess: i.tcg_set ?? '', rarity_vibe: 'From the Vault', image: i.image_url ?? '', hype_lines: ['Straight out of the Vault ✨'] }); setOpen(false); }} className="group overflow-hidden rounded-xl border border-border bg-muted text-left transition hover:border-primary">
              <div className="aspect-square bg-background">{i.image_url ? <img src={i.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-2xl">💎</div>}</div>
              <p className="truncate px-1.5 py-1 text-[11px] font-bold">{i.name}</p>
            </button>)}
        </div>
      </div>
    </div>}
  </>;
}
