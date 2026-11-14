import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { personalPreviewEnabled, PERSONAL_PROFILE_PREVIEW_PATH } from '@/lib/personalProfilePreview';

/** Preview-host-only entry point to the new personal profile design. Never renders on the live site. */
export function PersonalProfilePreviewBar() {
  const loc = useLocation();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(personalPreviewEnabled(import.meta.env.DEV, window.location.hostname)); }, []);
  if (!show || loc.pathname === PERSONAL_PROFILE_PREVIEW_PATH) return null;
  return (
    <div className="border-b border-primary bg-primary text-primary-foreground" data-preview-entry>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
        <span><strong>PREVIEW DESIGN</strong> · New personal profile is ready to review</span>
        <Link to="/preview/personal-profile" search={{ view: undefined }} className="rounded-md bg-background px-3 py-1 font-bold text-foreground">Open new profile →</Link>
      </div>
    </div>
  );
}
