import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Authenticated blob delivery: no public URL, signed URL or raw-URL fallback.
 * Re-fetches after focus; revokes object URLs on unmount/viewer changes. */
export function PersonalCandidateMedia({ path, kind, viewer, alt }: { path: string; kind: string; viewer: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    let generation = 0;
    const clear = () => { generation++; if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = null; setUrl(null); };
    const load = async () => {
      clear(); const version = generation; setFailed(false);
      const { data, error } = await supabase.storage.from('personal-profile-media').download(path);
      if (cancelled || version !== generation) return;
      if (error || !data) { setFailed(true); return; }
      blobUrl = URL.createObjectURL(data); setUrl(blobUrl);
    };
    void load();
    const focus = () => { if (document.hidden) clear(); else void load(); };
    document.addEventListener('visibilitychange', focus);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60000);
    return () => { cancelled = true; generation++; window.clearInterval(timer); document.removeEventListener('visibilitychange', focus); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [path, viewer]);
  if (!url) return <div className="personal-empty" role="status">{failed ? 'Media unavailable' : 'Loading media…'}</div>;
  return kind === 'video' ? <video src={url} controls playsInline preload="metadata" aria-label={alt} className="w-full" /> : <img src={url} alt={alt} loading="lazy" />;
}