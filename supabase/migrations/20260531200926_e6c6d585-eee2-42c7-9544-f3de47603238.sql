create or replace function public.admin_identity_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_total int;
  v_legacy int;
  v_dup_extra int;
  v_dup_groups int;
  v_pk_collisions int;
  v_orphans int;
  v_bad_lang int;
  v_sample jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin only';
  end if;

  select count(*) into v_total from public.card_identities;

  -- Runtime computeFingerprint() always yields exactly 32 lowercase hex chars.
  -- Anything else (e.g. the legacy "bf_" backfill format) can never be matched
  -- on rescan and WILL spawn a duplicate identity.
  select count(*) into v_legacy
  from public.card_identities
  where fingerprint !~ '^[0-9a-f]{32}$';

  -- Logical duplicates: same card information resolved to >1 master row.
  with grp as (
    select count(*) c
    from public.card_identities
    group by category, lower(name), lower(coalesce(set_code, set_name, '')),
             lower(coalesce(number, '')), lower(coalesce(language, ''))
    having count(*) > 1
  )
  select coalesce(sum(c - 1), 0), count(*) into v_dup_extra, v_dup_groups from grp;

  -- One market-data provider key should map to exactly ONE master identity.
  select count(*) into v_pk_collisions from (
    select pk from (
      select unnest(provider_keys) pk, id from public.card_identities
    ) t group by pk having count(distinct id) > 1
  ) x;

  select count(*) into v_orphans
  from public.vault_cards where master_identity_id is null;

  select count(*) into v_bad_lang
  from public.card_identities
  where language is null
     or language not in ('en','jp','zh','ko','fr','de','es','it','pt','ru');

  select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) into v_sample
  from (
    select category, name, coalesce(set_code, set_name) as set, number, language,
           count(*) as copies, array_agg(id) as ids
    from public.card_identities
    group by category, lower(name), lower(coalesce(set_code, set_name, '')),
             lower(coalesce(number, '')), lower(coalesce(language, '')),
             category, name, coalesce(set_code, set_name), number, language
    having count(*) > 1
    order by count(*) desc
    limit 25
  ) s;

  result := jsonb_build_object(
    'total_identities', v_total,
    'legacy_format_count', v_legacy,
    'duplicate_extra_rows', v_dup_extra,
    'duplicate_groups', v_dup_groups,
    'provider_key_collisions', v_pk_collisions,
    'orphan_vault_cards', v_orphans,
    'bad_language_codes', v_bad_lang,
    'duplicate_samples', v_sample,
    'generated_at', now()
  );
  return result;
end;
$$;

revoke all on function public.admin_identity_health() from public, anon;
grant execute on function public.admin_identity_health() to authenticated, service_role;