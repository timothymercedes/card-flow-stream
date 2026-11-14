import { useEffect, useState } from 'react';
import { personalPreviewEnabled } from '@/lib/personalProfilePreview';

/** Social links open the personal profile only in recognized previews, after
 * hydration. Published sites keep their current destinations until release. */
export function usePersonalProfileLinks() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(personalPreviewEnabled(import.meta.env.DEV, window.location.hostname)), []);
  return enabled;
}
