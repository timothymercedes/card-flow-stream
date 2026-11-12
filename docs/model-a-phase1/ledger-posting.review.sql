-- REVIEW ONLY. Execute after accounting-schema.review.sql in an isolated database.
-- Additive seal prevents late INSERT into committed journals. No Stripe operations.
CREATE TABLE public.model_a_journal_seals (
  journal_id uuid PRIMARY KEY REFERENCES public.model_a_ledger_journals(id),
  platform_account_id text NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.model_a_journal_seals TO service_role;
ALTER TABLE public.model_a_journal_seals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER immutable_seals BEFORE UPDATE OR DELETE ON public.model_a_journal_seals
FOR EACH ROW EXECUTE FUNCTION public.model_a_reject_journal_change();
CREATE OR REPLACE FUNCTION public.model_a_reject_late_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  -- Lock serializes a competing insertion with posting/sealing this journal.
  PERFORM 1 FROM public.model_a_ledger_journals WHERE id=NEW.journal_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.model_a_journal_seals WHERE journal_id=NEW.journal_id) THEN
    RAISE EXCEPTION 'Journal is sealed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_reject_late_entry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_reject_late_entry() TO service_role;
CREATE TRIGGER no_late_entry BEFORE INSERT ON public.model_a_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.model_a_reject_late_entry();

CREATE OR REPLACE FUNCTION public.model_a_require_seal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.model_a_journal_seals WHERE journal_id=NEW.id) THEN
    RAISE EXCEPTION 'Journal must be sealed in its posting transaction';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_require_seal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_require_seal() TO service_role;
CREATE CONSTRAINT TRIGGER require_sealed_journal AFTER INSERT ON public.model_a_ledger_journals
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.model_a_require_seal();

CREATE OR REPLACE FUNCTION public.model_a_post_journal(
  _environment text,_platform_account_id text,_currency text,_business_key text,
  _action text,_evidence_hash text,_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE existing public.model_a_ledger_journals; jid uuid; normalized_hash text;
BEGIN
  IF COALESCE(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service posting required' USING ERRCODE='42501';
  END IF;
  IF _environment IS NULL OR _environment NOT IN ('sandbox','live')
     OR _currency IS NULL OR _currency !~ '^[a-z]{3}$'
     OR NULLIF(btrim(_platform_account_id),'') IS NULL
     OR NULLIF(btrim(_business_key),'') IS NULL OR NULLIF(btrim(_action),'') IS NULL
     OR NULLIF(btrim(_evidence_hash),'') IS NULL
     OR _lines IS NULL OR jsonb_typeof(_lines)<>'array' THEN
    RAISE EXCEPTION 'Invalid posting';
  END IF;
  IF jsonb_array_length(_lines)<2 OR jsonb_array_length(_lines)>1000 THEN RAISE EXCEPTION 'Invalid lines'; END IF;
  -- Hash the full immutable request; evidence-only hashes cannot detect changed line payloads.
  normalized_hash:=md5(jsonb_build_object('platform',_platform_account_id,'currency',_currency,'action',_action,'evidence',_evidence_hash,'lines',_lines)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(_environment||':'||_business_key,0));
  SELECT * INTO existing FROM public.model_a_ledger_journals
    WHERE environment=_environment AND business_key=_business_key;
  IF FOUND THEN
    IF existing.source_evidence_hash<>normalized_hash THEN RAISE EXCEPTION 'Conflicting posting replay'; END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(_lines) AS x(account_code text,seller_id uuid,allocation_id uuid,debit_cents bigint,credit_cents bigint)
    WHERE account_code IS NULL OR debit_cents IS NULL OR credit_cents IS NULL) THEN RAISE EXCEPTION 'Missing line fields'; END IF;
  INSERT INTO public.model_a_ledger_journals(environment,currency,business_key,action,source_evidence_hash)
    VALUES(_environment,_currency,_business_key,_action,normalized_hash) RETURNING id INTO jid;
  INSERT INTO public.model_a_ledger_entries(journal_id,environment,currency,account_code,seller_id,allocation_id,debit_cents,credit_cents)
    SELECT jid,_environment,_currency,x.account_code,x.seller_id,x.allocation_id,x.debit_cents,x.credit_cents
    FROM jsonb_to_recordset(_lines) AS x(account_code text,seller_id uuid,allocation_id uuid,debit_cents bigint,credit_cents bigint);
  INSERT INTO public.model_a_journal_seals(journal_id,platform_account_id) VALUES(jid,_platform_account_id);
  RETURN jid;
END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_post_journal(text,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_post_journal(text,text,text,text,text,text,jsonb) TO service_role;
-- Posting enforces structural integrity, not verified economic settlement. Never expose directly
-- to a browser or accept client totals; settlement/transfer/loss service adapters remain required.