-- Isolated fixture database ONLY. Never run on project/production database.
SET request.jwt.claim.role='service_role';
SELECT public.model_a_post_journal('sandbox','acct_test','usd','fixture-sale','settlement','verified-fixture',
 '[{"account_code":"stripe_cash","debit_cents":10000,"credit_cents":0},{"account_code":"platform_commission","debit_cents":0,"credit_cents":500},{"account_code":"seller_pending","seller_id":"00000000-0000-0000-0000-000000000001","debit_cents":0,"credit_cents":9500}]');
DO $test$
DECLARE jid uuid; replay uuid; rejected boolean := false;
BEGIN
  SELECT id INTO jid FROM public.model_a_ledger_journals WHERE business_key='fixture-sale';
  replay:=public.model_a_post_journal('sandbox','acct_test','usd','fixture-sale','settlement','verified-fixture',
   '[{"account_code":"stripe_cash","debit_cents":10000,"credit_cents":0},{"account_code":"platform_commission","debit_cents":0,"credit_cents":500},{"account_code":"seller_pending","seller_id":"00000000-0000-0000-0000-000000000001","debit_cents":0,"credit_cents":9500}]');
  IF replay<>jid OR (SELECT count(*) FROM public.model_a_ledger_entries WHERE journal_id=jid)<>3 THEN RAISE EXCEPTION 'Replay duplicated journal'; END IF;
  BEGIN
    INSERT INTO public.model_a_ledger_entries(journal_id,environment,currency,account_code,debit_cents,credit_cents)
      VALUES(jid,'sandbox','usd','stripe_cash',1,0);
  EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Late line accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.model_a_post_journal('sandbox','acct_test','usd','fixture-sale','settlement','changed','[]');
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Conflicting replay accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.model_a_post_journal('sandbox','acct_other','usd','fixture-sale','settlement','verified-fixture',
     '[{"account_code":"stripe_cash","debit_cents":10000,"credit_cents":0},{"account_code":"platform_commission","debit_cents":0,"credit_cents":10000}]');
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cross-platform replay accepted'; END IF;
  IF has_function_privilege('authenticated','public.model_a_post_journal(text,text,text,text,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.model_a_post_journal(text,text,text,text,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser posting permission'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.model_a_post_journal('sandbox','acct_test','usd','bad-balance','settlement','fixture',
     '[{"account_code":"stripe_cash","debit_cents":100,"credit_cents":0},{"account_code":"platform_commission","debit_cents":0,"credit_cents":99}]');
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected OR EXISTS(SELECT 1 FROM public.model_a_ledger_journals WHERE business_key='bad-balance') THEN RAISE EXCEPTION 'Unbalanced journal survived'; END IF;
  RAISE NOTICE 'Replay, sealing, conflicts, platform scope, browser grants and balance rollback passed';
END;
$test$;