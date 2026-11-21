CREATE OR REPLACE FUNCTION public.story_reaction_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text;
BEGIN
  SELECT user_id INTO _owner FROM public.stories WHERE id = NEW.story_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT username INTO _name FROM public.profiles WHERE id = NEW.user_id;
  BEGIN
    PERFORM public.notify_user(_user_id => _owner, _type => 'story_reaction', _category => 'social',
      _body => '@' || coalesce(_name,'someone') || ' reacted to your story', _link => '/stories');
  EXCEPTION WHEN others THEN NULL; END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.story_reaction_notify() FROM public, anon, authenticated;
CREATE TRIGGER trg_story_reaction_notify AFTER INSERT ON public.story_reactions
  FOR EACH ROW EXECUTE FUNCTION public.story_reaction_notify();

CREATE OR REPLACE FUNCTION public.reply_to_story(_story_id uuid, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.stories; _me uuid := auth.uid(); _name text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Sign in to reply'; END IF;
  IF char_length(trim(coalesce(_message,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Reply must be 1-500 characters'; END IF;
  SELECT * INTO _s FROM public.stories WHERE id = _story_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_view_story(_s.user_id, _s.visibility, _me) THEN RAISE EXCEPTION 'Story unavailable'; END IF;
  IF _s.user_id = _me THEN RAISE EXCEPTION 'You cannot reply to your own story'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id = _s.user_id AND blocked_id = _me) OR (blocker_id = _me AND blocked_id = _s.user_id)) THEN RAISE EXCEPTION 'Story unavailable'; END IF;
  SELECT username INTO _name FROM public.profiles WHERE id = _me;
  INSERT INTO public.direct_messages(sender_id, sender_username, recipient_id, content)
  VALUES (_me, coalesce(_name,'user'), _s.user_id, 'Replied to your story: ' || trim(_message));
  BEGIN
    PERFORM public.notify_user(_user_id => _s.user_id, _type => 'story_reply', _category => 'social',
      _body => '@' || coalesce(_name,'someone') || ' replied to your story', _link => '/messages/' || _me::text);
  EXCEPTION WHEN others THEN NULL; END;
END $$;
REVOKE EXECUTE ON FUNCTION public.reply_to_story(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_story(uuid, text) TO authenticated;