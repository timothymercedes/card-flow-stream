import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { candidateIdentity, candidatePost, candidateMedia } from './personalProfileCandidate';
import { z } from 'zod';

// Every handler repeats this guard inside the server boundary. Acceptance alone
// cannot activate this owner candidate against a hosted/shared production backend.
function assertIsolatedCandidate(url: string | undefined, request: Request) {
  const host = url ? new URL(url).hostname : '';
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) throw new Error('Candidate is disabled outside the isolated draft.');
  const requestHost = new URL(request.url).hostname;
  if (requestHost === 'pullbidlive.com' || requestHost === 'www.pullbidlive.com' || requestHost === 'card-flow-stream.lovable.app') throw new Error('Candidate is not released.');
}
function checked<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> { if (result.error) throw new Error(result.error.message); if (result.data === null || result.data === undefined) throw new Error('Requested record unavailable.'); return result.data; }

export const loadPersonalCandidate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { username?: string }) => z.object({ username: z.string().max(40).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const { supabase, userId } = context;
    const identityResult = await supabase.from('personal_social_identities').select('user_id,username,display_name,bio,audience').eq('user_id', userId).maybeSingle();
    if (identityResult.error) throw new Error(identityResult.error.message);
    const identity = identityResult.data;
    // No lookup of another person's private identity; no browser audience filtering.
    if (data.username && data.username !== identity?.username) return { unavailable: true as const, identity: null, posts: [], media: [], comments: [], reactions: [], cards: [] };
    const posts = checked(await supabase.from('personal_social_posts').select('id,caption,audience,allow_comments,pinned,collectible_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100));
    const media = checked(await supabase.from('personal_social_media').select('id,post_id,object_path,kind,slot,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500));
    const ids = posts.map(p => p.id);
    const comments = ids.length ? checked(await supabase.from('personal_social_comments').select('id,post_id,content,created_at').in('post_id', ids).order('created_at').limit(500)) : [];
    const reactions = ids.length ? checked(await supabase.from('personal_social_reactions').select('post_id,user_id').in('post_id', ids).limit(500)) : [];
    const cards = checked(await supabase.from('vault_cards').select('id,name,visibility').eq('user_id', userId).limit(100));
    return { unavailable: false as const, identity, posts, media, comments, reactions, cards };
  });

export const savePersonalIdentity = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => candidateIdentity.parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    return checked(await context.supabase.from('personal_social_identities').upsert({ ...data, user_id: context.userId }, { onConflict: 'user_id' }).select('username').single());
  });
export const savePersonalPost = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => candidatePost.parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const { id, ...fields } = data;
    if (id) return checked(await context.supabase.from('personal_social_posts').update(fields).eq('id', id).eq('user_id', context.userId).select('id').single());
    return checked(await context.supabase.from('personal_social_posts').insert({ ...fields, user_id: context.userId }).select('id').single());
  });
export const controlPersonalPost = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ id: z.string().uuid(), action: z.enum(['pin','comments','delete','react']), value: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const { supabase, userId } = context;
    checked(await supabase.from('personal_social_posts').select('id').eq('id', data.id).eq('user_id', userId).single());
    if (data.action === 'delete') {
      const media = checked(await supabase.from('personal_social_media').select('object_path').eq('post_id', data.id).eq('user_id', userId));
      if (media.length) checked(await supabase.storage.from('personal-profile-media').remove(media.map(m => m.object_path)));
      checked(await supabase.from('personal_social_posts').delete().eq('id', data.id).eq('user_id', userId).select('id'));
    } else if (data.action === 'react') {
      if (data.value) checked(await supabase.from('personal_social_reactions').upsert({ post_id: data.id, user_id: userId }).select('post_id'));
      else checked(await supabase.from('personal_social_reactions').delete().eq('post_id', data.id).eq('user_id', userId).select('post_id'));
    } else checked(await supabase.from('personal_social_posts').update(data.action === 'pin' ? { pinned: data.value ?? false } : { allow_comments: data.value ?? false }).eq('id', data.id).eq('user_id', userId).select('id'));
    return { ok: true };
  });
export const changePersonalComment = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ post_id: z.string().uuid(), id: z.string().uuid().optional(), content: z.string().trim().min(1).max(2000).optional(), remove: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const { supabase, userId } = context;
    if (data.remove && data.id) checked(await supabase.from('personal_social_comments').delete().eq('id', data.id).eq('post_id', data.post_id).select('id'));
    else if (data.content && data.id) checked(await supabase.from('personal_social_comments').update({ content: data.content }).eq('id', data.id).eq('post_id', data.post_id).eq('user_id', userId).select('id'));
    else if (data.content) checked(await supabase.from('personal_social_comments').insert({ post_id: data.post_id, content: data.content, user_id: userId }).select('id'));
    else throw new Error('Comment text required.');
    return { ok: true };
  });
export const preparePersonalMedia = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => candidateMedia.parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const object_path = `${context.userId}/${crypto.randomUUID()}.${data.extension}`;
    return checked(await context.supabase.from('personal_social_media').insert({ user_id: context.userId, post_id: data.post_id, slot: data.slot, kind: data.kind, object_path }).select('id,object_path').single());
  });
export const removePersonalMedia = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    assertIsolatedCandidate(process.env['SUPABASE_URL'], getRequest());
    const item = checked(await context.supabase.from('personal_social_media').select('id,object_path').eq('id', data.id).eq('user_id', context.userId).single());
    checked(await context.supabase.storage.from('personal-profile-media').remove([item.object_path]));
    checked(await context.supabase.from('personal_social_media').delete().eq('id', item.id).eq('user_id', context.userId).select('id'));
    return { ok: true };
  });