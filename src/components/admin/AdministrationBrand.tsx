import { useEffect } from 'react';
import shield from '@/assets/administration/shield.asset.json';

export function AdministrationBrand({ large = false }: { large?: boolean }) {
  return <div className={`flex items-center gap-3 ${large ? 'flex-col text-center' : ''}`}>
    <img src={shield.url} alt="PB Shield" className={`${large ? 'h-28 w-24' : 'h-12 w-10'} shrink-0 object-contain`} />
    <div className="min-w-0"><p className={`${large ? 'text-2xl' : 'text-sm'} font-bold`}>PULLBID LIVE</p><p className="text-xs font-semibold">ADMINISTRATION</p></div>
  </div>;
}

export function AdministrationFavicon() {
  useEffect(() => {
    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    const previous = icons.map(icon => ({ icon, href: icon.getAttribute('href'), type: icon.getAttribute('type') }));
    const added = icons.length === 0 ? document.createElement('link') : null;
    const active = added ? [added] : icons;
    if (added) { added.rel = 'icon'; document.head.appendChild(added); }
    active.forEach(icon => { icon.href = shield.url; icon.type = 'image/png'; });
    return () => {
      added?.remove();
      previous.forEach(({ icon, href, type }) => {
        if (href) icon.setAttribute('href', href); else icon.removeAttribute('href');
        if (type) icon.setAttribute('type', type); else icon.removeAttribute('type');
      });
    };
  }, []);
  return null;
}