-- REVIEW ONLY — NOT APPLIED. Outside every automatic migration directory.
-- Additive schema, no existing object replacement, row backfill or live feature enablement.
-- Currency/environment composite foreign keys prevent cross-mode allocation.
CREATE TABLE public.model_a_seller_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  platform_account_id text NOT NULL,
  connected_account_id text NOT NULL,
  country text NOT NULL,
  transfers_status text NOT NULL DEFAULT 'pending',
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, environment, platform_account_id),
  UNIQUE (environment, platform_account_id, connected_account_id),
  UNIQUE (id, seller_id, environment)
);
GRANT SELECT ON public.model_a_seller_accounts TO authenticated;
GRANT ALL ON public.model_a_seller_accounts TO service_role;
ALTER TABLE public.model_a_seller_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_seller_accounts FOR SELECT TO authenticated USING (seller_id=auth.uid());

CREATE TABLE public.model_a_payment_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  platform_account_id text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  model text NOT NULL CHECK (model IN ('separate','legacy_destination','quarantined')),
  business_key text NOT NULL,
  stripe_checkout_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_balance_transaction_id text,
  charged_cents bigint NOT NULL CHECK (charged_cents>=0),
  actual_stripe_fee_cents bigint CHECK (actual_stripe_fee_cents>=0),
  payment_state text NOT NULL DEFAULT 'pending' CHECK (payment_state IN ('pending','requires_action','settled','failed','refunded','partially_refunded','disputed')),
  settled_at timestamptz,
  funds_available_at timestamptz,
  source_snapshot_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, platform_account_id, business_key),
  UNIQUE (environment, platform_account_id, stripe_charge_id),
  UNIQUE (environment, platform_account_id, stripe_payment_intent_id),
  UNIQUE (id,environment,currency)
);
GRANT SELECT ON public.model_a_payment_groups TO authenticated;
GRANT ALL ON public.model_a_payment_groups TO service_role;
ALTER TABLE public.model_a_payment_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY buyer_read ON public.model_a_payment_groups FOR SELECT TO authenticated USING (buyer_id=auth.uid());

CREATE TABLE public.model_a_order_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_group_id uuid NOT NULL,
  order_id uuid, -- Nullable for dedicated test fixtures; never seed into production orders.
  seller_id uuid NOT NULL,
  seller_account_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  currency text NOT NULL,
  allocation_key text NOT NULL,
  item_cents bigint NOT NULL CHECK (item_cents>=0),
  shipping_cents bigint NOT NULL DEFAULT 0 CHECK (shipping_cents>=0),
  insurance_cents bigint NOT NULL DEFAULT 0 CHECK (insurance_cents>=0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK (tax_cents>=0),
  buyer_fee_cents bigint NOT NULL DEFAULT 0 CHECK (buyer_fee_cents>=0),
  buyer_processing_cents bigint NOT NULL DEFAULT 0 CHECK (buyer_processing_cents>=0),
  commission_cents bigint NOT NULL CHECK (commission_cents>=0),
  seller_cost_cents bigint NOT NULL DEFAULT 0 CHECK (seller_cost_cents>=0),
  seller_net_cents bigint NOT NULL CHECK (seller_net_cents>=0),
  gross_cents bigint NOT NULL CHECK (gross_cents>=0),
  policy_version text NOT NULL,
  evidence_state text NOT NULL DEFAULT 'unverified' CHECK (evidence_state IN ('unverified','verified','quarantined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(payment_group_id,environment,currency) REFERENCES public.model_a_payment_groups(id,environment,currency),
  FOREIGN KEY(seller_account_id,seller_id,environment) REFERENCES public.model_a_seller_accounts(id,seller_id,environment),
  CHECK (seller_net_cents+commission_cents+seller_cost_cents=item_cents),
  CHECK (gross_cents=item_cents+shipping_cents+insurance_cents+tax_cents+buyer_fee_cents+buyer_processing_cents),
  UNIQUE(payment_group_id,allocation_key),
  UNIQUE(id,environment,currency,seller_id)
);
GRANT SELECT ON public.model_a_order_allocations TO authenticated;
GRANT ALL ON public.model_a_order_allocations TO service_role;
ALTER TABLE public.model_a_order_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_order_allocations FOR SELECT TO authenticated USING(seller_id=auth.uid());
-- Buyer sees own payment group; a restricted buyer projection may be added later without exposing seller accounting.

CREATE TABLE public.model_a_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK(provider IN ('stripe','shippo')),
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  scope_id text NOT NULL, -- Stripe platform/connected account or carrier tenant.
  provider_event_key text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  verified_at timestamptz NOT NULL,
  provider_occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','processed','retry','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_until timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider,environment,scope_id,provider_event_key),
  UNIQUE(id,environment)
);
GRANT ALL ON public.model_a_event_inbox TO service_role;
ALTER TABLE public.model_a_event_inbox ENABLE ROW LEVEL SECURITY;
-- No browser policies/grants. Payloads can contain private provider data.

CREATE TABLE public.model_a_delivery_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  currency text NOT NULL,
  event_id uuid NOT NULL,
  shipment_key text NOT NULL,
  carrier text NOT NULL,
  tracking_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('accepted','in_transit','delivered','returned','failed','lost')),
  carrier_occurred_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  counts_for_tier boolean NOT NULL DEFAULT false,
  voided_by_receipt_id uuid REFERENCES public.model_a_delivery_receipts(id),
  FOREIGN KEY(allocation_id,environment,currency,seller_id) REFERENCES public.model_a_order_allocations(id,environment,currency,seller_id),
  FOREIGN KEY(event_id,environment) REFERENCES public.model_a_event_inbox(id,environment),
  UNIQUE(allocation_id,event_id,status)
);
GRANT SELECT ON public.model_a_delivery_receipts TO authenticated;
GRANT ALL ON public.model_a_delivery_receipts TO service_role;
ALTER TABLE public.model_a_delivery_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_delivery_receipts FOR SELECT TO authenticated USING(seller_id=auth.uid());
-- A reviewed posting function assigns counts_for_tier; grouping semantics must be approved first.

CREATE TABLE public.model_a_ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  currency text NOT NULL CHECK(currency ~ '^[a-z]{3}$'),
  business_key text NOT NULL,
  action text NOT NULL,
  payment_group_id uuid,
  source_event_id uuid,
  reverses_journal_id uuid,
  source_evidence_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(payment_group_id,environment,currency) REFERENCES public.model_a_payment_groups(id,environment,currency),
  FOREIGN KEY(source_event_id,environment) REFERENCES public.model_a_event_inbox(id,environment),
  FOREIGN KEY(reverses_journal_id,environment,currency) REFERENCES public.model_a_ledger_journals(id,environment,currency),
  UNIQUE(environment,business_key),
  UNIQUE(id,environment,currency)
);
GRANT ALL ON public.model_a_ledger_journals TO service_role;
ALTER TABLE public.model_a_ledger_journals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.model_a_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  currency text NOT NULL,
  seller_id uuid,
  allocation_id uuid,
  account_code text NOT NULL CHECK(account_code IN ('stripe_cash','seller_pending','seller_delivered_held','seller_unlocked','seller_reserve','seller_transfer_reserved','seller_transferred','seller_recovery_debt','platform_commission','platform_buyer_fee','tax_payable','shipping_liability','insurance_liability','stripe_processing_expense','dispute_expense')),
  debit_cents bigint NOT NULL DEFAULT 0 CHECK(debit_cents>=0),
  credit_cents bigint NOT NULL DEFAULT 0 CHECK(credit_cents>=0),
  FOREIGN KEY(journal_id,environment,currency) REFERENCES public.model_a_ledger_journals(id,environment,currency),
  FOREIGN KEY(allocation_id,environment,currency,seller_id) REFERENCES public.model_a_order_allocations(id,environment,currency,seller_id),
  CHECK ((debit_cents>0 AND credit_cents=0) OR (credit_cents>0 AND debit_cents=0)),
  CHECK (allocation_id IS NULL OR seller_id IS NOT NULL),
  CHECK (account_code NOT LIKE 'seller_%' OR seller_id IS NOT NULL)
);
GRANT SELECT ON public.model_a_ledger_entries TO authenticated;
GRANT ALL ON public.model_a_ledger_entries TO service_role;
ALTER TABLE public.model_a_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_ledger_entries FOR SELECT TO authenticated USING(seller_id=auth.uid());

CREATE TABLE public.model_a_transfer_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL CHECK(environment IN ('sandbox','live')),
  currency text NOT NULL CHECK(currency ~ '^[a-z]{3}$'),
  request_key text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','reserved','submitting','accepted','retry','failed','canceled','partially_reversed','reversed')),
  reserved_cents bigint NOT NULL CHECK(reserved_cents>0),
  eligibility_snapshot_hash text NOT NULL,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(seller_account_id,seller_id,environment) REFERENCES public.model_a_seller_accounts(id,seller_id,environment),
  UNIQUE(environment,seller_id,request_key),
  UNIQUE(id,environment,currency,seller_id)
);
GRANT SELECT ON public.model_a_transfer_jobs TO authenticated;
GRANT ALL ON public.model_a_transfer_jobs TO service_role;
ALTER TABLE public.model_a_transfer_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_transfer_jobs FOR SELECT TO authenticated USING(seller_id=auth.uid());

CREATE TABLE public.model_a_transfer_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  allocation_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL,
  currency text NOT NULL,
  transfer_action_key text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  source_charge_id text NOT NULL,
  stripe_transfer_id text,
  accepted_at timestamptz,
  FOREIGN KEY(job_id,environment,currency,seller_id) REFERENCES public.model_a_transfer_jobs(id,environment,currency,seller_id),
  FOREIGN KEY(allocation_id,environment,currency,seller_id) REFERENCES public.model_a_order_allocations(id,environment,currency,seller_id),
  UNIQUE(environment,transfer_action_key),
  UNIQUE(environment,stripe_transfer_id),
  UNIQUE(job_id,allocation_id),
  UNIQUE(id,environment,currency,seller_id)
);
GRANT SELECT ON public.model_a_transfer_allocations TO authenticated;
GRANT ALL ON public.model_a_transfer_allocations TO service_role;
ALTER TABLE public.model_a_transfer_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_transfer_allocations FOR SELECT TO authenticated USING(seller_id=auth.uid());

CREATE TABLE public.model_a_transfer_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_allocation_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL,
  currency text NOT NULL,
  attempt integer NOT NULL CHECK(attempt>0),
  stripe_idempotency_key text NOT NULL,
  request_payload_hash text NOT NULL,
  stripe_request_id text,
  outcome text NOT NULL CHECK(outcome IN ('started','accepted','ambiguous','rejected')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(transfer_allocation_id,environment,currency,seller_id) REFERENCES public.model_a_transfer_allocations(id,environment,currency,seller_id),
  UNIQUE(transfer_allocation_id,attempt)
);
GRANT ALL ON public.model_a_transfer_attempts TO service_role;
ALTER TABLE public.model_a_transfer_attempts ENABLE ROW LEVEL SECURITY;
-- Stable idempotency key repeats across retries intentionally; payload hash must remain identical.

CREATE TABLE public.model_a_loss_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL,
  currency text NOT NULL,
  business_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('refund','dispute_withdrawal','dispute_reinstatement','transfer_reversal','recovery')),
  stripe_object_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK(tax_cents>=0),
  commission_cents bigint NOT NULL DEFAULT 0 CHECK(commission_cents>=0),
  seller_cents bigint NOT NULL DEFAULT 0 CHECK(seller_cents>=0),
  status text NOT NULL CHECK(status IN ('pending','succeeded','failed','recovery_due')),
  journal_id uuid,
  FOREIGN KEY(allocation_id,environment,currency,seller_id) REFERENCES public.model_a_order_allocations(id,environment,currency,seller_id),
  FOREIGN KEY(journal_id,environment,currency) REFERENCES public.model_a_ledger_journals(id,environment,currency),
  CHECK(tax_cents+commission_cents+seller_cents<=amount_cents),
  UNIQUE(environment,business_key)
);
GRANT SELECT ON public.model_a_loss_allocations TO authenticated;
GRANT ALL ON public.model_a_loss_allocations TO service_role;
ALTER TABLE public.model_a_loss_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_read ON public.model_a_loss_allocations FOR SELECT TO authenticated USING(seller_id=auth.uid());

CREATE TABLE public.model_a_bank_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_account_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  environment text NOT NULL,
  currency text NOT NULL,
  stripe_payout_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  status text NOT NULL CHECK(status IN ('pending','in_transit','paid','failed','canceled')),
  failure_code text,
  verified_at timestamptz NOT NULL,
  FOREIGN KEY(seller_account_id,seller_id,environment) REFERENCES public.model_a_seller_accounts(id,seller_id,environment),
  UNIQUE(environment,stripe_payout_id)
);
GRANT SELECT ON public.model_a_bank_payouts TO authenticated;
GRANT ALL ON public.model_a_bank_payouts TO service_role;
ALTER TABLE public.model_a_bank_payouts ENABLE ROW LEVEL SECURITY;
-- No browser policy: expose only a narrow verified status projection later.
-- Payouts can aggregate many transfers; never count bank payout as a second seller earnings debit.

CREATE OR REPLACE FUNCTION public.model_a_reject_journal_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'Ledger is append-only; post a compensating journal' USING ERRCODE='42501'; END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_reject_journal_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_reject_journal_change() TO service_role;
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON public.model_a_ledger_journals FOR EACH ROW EXECUTE FUNCTION public.model_a_reject_journal_change();
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON public.model_a_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.model_a_reject_journal_change();

CREATE OR REPLACE FUNCTION public.model_a_check_journal_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE target_id uuid; total_debit numeric; total_credit numeric; line_count bigint;
BEGIN
  target_id := CASE WHEN TG_TABLE_NAME='model_a_ledger_journals' THEN NEW.id ELSE NEW.journal_id END;
  SELECT count(*),COALESCE(sum(debit_cents),0),COALESCE(sum(credit_cents),0)
  INTO line_count,total_debit,total_credit FROM public.model_a_ledger_entries WHERE journal_id=target_id;
  IF line_count<2 OR total_debit<>total_credit THEN RAISE EXCEPTION 'Journal must have balanced debit and credit lines'; END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.model_a_check_journal_balance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.model_a_check_journal_balance() TO service_role;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON public.model_a_ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.model_a_check_journal_balance();
CREATE CONSTRAINT TRIGGER balanced_entries AFTER INSERT ON public.model_a_ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.model_a_check_journal_balance();
CREATE INDEX model_a_seller_ledger ON public.model_a_ledger_entries(seller_id,environment,currency,journal_id);
CREATE INDEX model_a_jobs_ready ON public.model_a_transfer_jobs(environment,status,created_at);
CREATE INDEX model_a_events_ready ON public.model_a_event_inbox(status,next_attempt_at);
-- Runtime-dependent eligibility, allocation sum/cap, settlement and verified-delivery checks
-- belong to reviewed transactional posting/reservation functions, not time-dependent CHECKs.
-- No execution handler is wired by this proposal. Below-25/reserve deadlines await Stripe review.
