import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';

// Public endpoint: the caller is identified only from a verified bearer token,
// and every permission is re-derived on the server for each request.
export const loadPersonalVisitor = createServerFn({ method: 'POST' })
  .inputValidator((input: { username: string; cursor?: number }) => z.object({ username: z.string().min(1).max(40), cursor: z.number().int().min(0).max(10000).optional() }).parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const s = await import('./personalProfileVisitor.server');
    // A closed gate looks exactly like a private or missing profile.
    try { s.assertIsolatedPersonalProfile(request); } catch { return s.UNAVAILABLE; }
    const db = await s.admin();
    return s.loadVisitorProfile(db, await s.optionalViewer(db, request), data.username, data.cursor);
  });

export const interactPersonalVisitor = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ post_id: z.string().uuid(), kind: z.enum(['react', 'comment']), value: z.boolean().optional(), content: z.string().trim().min(1).max(2000).optional() }).parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const s = await import('./personalProfileVisitor.server');
    s.assertIsolatedPersonalProfile(request);
    const db = await s.admin();
    const viewer = await s.optionalViewer(db, request);
    if (!viewer) throw new Error('Sign in to interact.');
    if (data.kind === 'comment' && !data.content) throw new Error('Comment text required.');
    return s.visitorInteract(db, viewer, data.post_id, data.kind === 'react' ? { kind: 'react', value: !!data.value } : { kind: 'comment', content: data.content! });
  });
