import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { personalPreviewEnabled, PERSONAL_PROFILE_PREVIEW_PATH } from '@/lib/personalProfilePreview';
import { Button } from '@/components/ui/button';

/** Preview-host-only entry point to the new personal profile design. Never renders on the live site. */
export function PersonalProfilePreviewBar() {
  const loc = useLocation();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(personalPreviewEnabled(import.meta.env.DEV, window.location.hostname)); }, []);
  if (!show) return null;
  return (
    <div className="border-b border-primary bg-primary text-primary-foreground" data-preview-entry>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
        <span><strong>PREVIEW DESIGN</strong> · Live data stays unchanged</span>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm"><Link to="/preview/personal-profile" search={{ view: undefined }} aria-current={loc.pathname === PERSONAL_PROFILE_PREVIEW_PATH ? 'page' : undefined}>Open new profile →</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link to="/preview/vault-privacy">Vault privacy preview →</Link></Button>
        </div>
      </div>
    </div>
  );
}
