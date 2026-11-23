CREATE TABLE public.cf_call_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cf_call_sessions TO service_role;
ALTER TABLE public.cf_call_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX cf_call_sessions_created_idx ON public.cf_call_sessions(created_at);

CREATE OR REPLACE FUNCTION public.admin_recanonicalize_identity(_actor uuid, _id uuid, _new_fingerprint text, _new_language text, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  existing uuid;
  old_fp text;
  old_lang text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR _actor IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _id IS NULL OR NOT EXISTS (SELECT 1 FROM public.card_identities WHERE id = _id) THEN
    RAISE EXCEPTION 'Identity not found';
  END IF;
  IF _new_fingerprint IS NULL OR _new_fingerprint !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid fingerprint';
  END IF;
  SELECT fingerprint, language INTO old_fp, old_lang FROM public.card_identities WHERE id = _id;
  SELECT id INTO existing FROM public.card_identities WHERE fingerprint = _new_fingerprint AND id <> _id LIMIT 1;
  IF existing IS NOT NULL THEN
    PERFORM public._merge_identity_refs(existing, _id);
    INSERT INTO public.admin_action_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
    VALUES (_actor, 'identity_recanonicalize_merge', 'card_identities', existing,
            jsonb_build_object('id', _id, 'fingerprint', old_fp, 'language', old_lang),
            jsonb_build_object('survivor', existing, 'fingerprint', _new_fingerprint), _reason);
    RETURN jsonb_build_object('result', 'merged', 'survivor', existing);
  END IF;
  UPDATE public.card_identities SET fingerprint = _new_fingerprint, language = _new_language WHERE id = _id;
  INSERT INTO public.admin_action_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  VALUES (_actor, 'identity_recanonicalize', 'card_identities', _id,
          jsonb_build_object('fingerprint', old_fp, 'language', old_lang),
          jsonb_build_object('fingerprint', _new_fingerprint, 'language', _new_language), _reason);
  RETURN jsonb_build_object('result', 'updated', 'id', _id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_recanonicalize_identity(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recanonicalize_identity(uuid,uuid,text,text,text) TO authenticated, service_role;