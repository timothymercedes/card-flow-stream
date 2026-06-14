
-- Internal: repoint all FK references from a victim identity onto a survivor,
-- and consolidate provider_keys + external_ids onto the survivor. Caller must
-- have already verified admin rights.
CREATE OR REPLACE FUNCTION public._merge_identity_refs(_survivor uuid, _victim uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keys text[];
  v_ext jsonb;
BEGIN
  IF _survivor = _victim THEN RETURN; END IF;

  -- Repoint referencing rows.
  UPDATE public.card_images      SET identity_id = _survivor      WHERE identity_id = _victim;
  UPDATE public.price_observations SET identity_id = _survivor    WHERE identity_id = _victim;
  UPDATE public.sold_comps       SET identity_id = _survivor      WHERE identity_id = _victim;
  UPDATE public.vault_cards      SET master_identity_id = _survivor WHERE master_identity_id = _victim;
  UPDATE public.vault_cards      SET card_identity_id = _survivor  WHERE card_identity_id = _victim;
  UPDATE public.wishlist_items   SET card_identity_id = _survivor  WHERE card_identity_id = _victim;

  -- Consolidate provider_keys (array) + external_ids (jsonb) onto survivor.
  SELECT
    ARRAY(
      SELECT DISTINCT k FROM unnest(
        COALESCE(s.provider_keys, '{}') || COALESCE(v.provider_keys, '{}')
      ) AS k WHERE k IS NOT NULL AND k <> ''
    ),
    COALESCE(v.external_ids, '{}'::jsonb) || COALESCE(s.external_ids, '{}'::jsonb)
  INTO v_keys, v_ext
  FROM public.card_identities s, public.card_identities v
  WHERE s.id = _survivor AND v.id = _victim;

  UPDATE public.card_identities
  SET provider_keys = v_keys, external_ids = v_ext
  WHERE id = _survivor;

  DELETE FROM public.card_identities WHERE id = _victim;
END;
$$;

-- Admin: merge a set of duplicate identities into one chosen survivor.
CREATE OR REPLACE FUNCTION public.admin_merge_identities(
  _actor uuid,
  _survivor uuid,
  _victims uuid[],
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v uuid;
  merged int := 0;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _survivor IS NULL OR NOT EXISTS (SELECT 1 FROM public.card_identities WHERE id = _survivor) THEN
    RAISE EXCEPTION 'Survivor identity not found';
  END IF;

  FOREACH v IN ARRAY _victims LOOP
    IF v IS NOT NULL AND v <> _survivor
       AND EXISTS (SELECT 1 FROM public.card_identities WHERE id = v) THEN
      PERFORM public._merge_identity_refs(_survivor, v);
      merged := merged + 1;
    END IF;
  END LOOP;

  INSERT INTO public.admin_action_log (admin_id, action, target_table, target_id, after_state, reason)
  VALUES (_actor, 'identity_merge', 'card_identities', _survivor,
          jsonb_build_object('survivor', _survivor, 'victims', _victims, 'merged', merged),
          _reason);

  RETURN jsonb_build_object('survivor', _survivor, 'merged', merged);
END;
$$;

-- Admin: set an identity's fingerprint + language. If another identity already
-- holds the target fingerprint, this identity is merged into it instead.
CREATE OR REPLACE FUNCTION public.admin_recanonicalize_identity(
  _actor uuid,
  _id uuid,
  _new_fingerprint text,
  _new_language text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  old_fp text;
  old_lang text;
BEGIN
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

  SELECT id INTO existing
  FROM public.card_identities
  WHERE fingerprint = _new_fingerprint AND id <> _id
  LIMIT 1;

  IF existing IS NOT NULL THEN
    PERFORM public._merge_identity_refs(existing, _id);
    INSERT INTO public.admin_action_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
    VALUES (_actor, 'identity_recanonicalize_merge', 'card_identities', existing,
            jsonb_build_object('id', _id, 'fingerprint', old_fp, 'language', old_lang),
            jsonb_build_object('survivor', existing, 'fingerprint', _new_fingerprint),
            _reason);
    RETURN jsonb_build_object('result', 'merged', 'survivor', existing);
  END IF;

  UPDATE public.card_identities
  SET fingerprint = _new_fingerprint, language = _new_language
  WHERE id = _id;

  INSERT INTO public.admin_action_log (admin_id, action, target_table, target_id, before_state, after_state, reason)
  VALUES (_actor, 'identity_recanonicalize', 'card_identities', _id,
          jsonb_build_object('fingerprint', old_fp, 'language', old_lang),
          jsonb_build_object('fingerprint', _new_fingerprint, 'language', _new_language),
          _reason);

  RETURN jsonb_build_object('result', 'updated', 'id', _id);
END;
$$;

REVOKE ALL ON FUNCTION public._merge_identity_refs(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_identities(uuid, uuid, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_recanonicalize_identity(uuid, uuid, text, text, text) TO authenticated, service_role;
