import { createFileRoute } from '@tanstack/react-router';

// Direct media: every request re-checks the caller, the media slot and the
// parent story audience before streaming bytes. No public or signed URLs.
export const Route = createFileRoute('/api/personal-media/$id')({
  server: { handlers: { GET: async ({ request, params }) => {
    const s = await import('@/lib/personalProfileVisitor.server');
    try { s.assertIsolatedPersonalProfile(request); } catch { return new Response('Not found', { status: 404 }); }
    const db = await s.admin();
    const item = await s.authorizeMedia(db, await s.optionalViewer(db, request), params.id);
    if (!item) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const file = await db.storage.from('personal-profile-media').download(item.object_path);
    if (file.error || !file.data) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(file.data, { headers: { 'Content-Type': file.data.type || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg'), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } } },
});
