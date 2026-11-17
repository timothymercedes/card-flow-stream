ALTER TABLE public.trades ADD COLUMN from_carrier text, ADD COLUMN from_tracking text, ADD COLUMN from_shipped_at timestamptz, ADD COLUMN to_carrier text, ADD COLUMN to_tracking text, ADD COLUMN to_shipped_at timestamptz, ADD COLUMN from_received_at timestamptz, ADD COLUMN to_received_at timestamptz;
CREATE TABLE public.trade_issues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trade_id uuid NOT NULL REFERENCES public.trades(id),reporter_id uuid NOT NULL,body text NOT NULL CHECK(length(trim(body)) BETWEEN 10 AND 2000),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz);
GRANT SELECT ON public.trade_issues TO authenticated; GRANT ALL ON public.trade_issues TO service_role;
ALTER TABLE public.trade_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY trade_issue_reporter_read ON public.trade_issues FOR SELECT TO authenticated USING(reporter_id=auth.uid() AND EXISTS(SELECT 1 FROM public.trades t WHERE t.id=trade_id AND auth.uid() IN(t.from_user,t.to_user)));
CREATE TABLE public.trade_card_locks(vault_card_id uuid PRIMARY KEY REFERENCES public.vault_cards(id),trade_id uuid NOT NULL REFERENCES public.trades(id),owner_id uuid NOT NULL);
GRANT SELECT ON public.trade_card_locks TO authenticated; GRANT ALL ON public.trade_card_locks TO service_role;
ALTER TABLE public.trade_card_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY trade_lock_owner_read ON public.trade_card_locks FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE INDEX trade_issue_open_idx ON public.trade_issues(trade_id) WHERE resolved_at IS NULL;
INSERT INTO public.trade_card_locks SELECT i.vault_card_id,i.trade_id,i.owner_id FROM public.trade_items i JOIN public.trades t ON t.id=i.trade_id WHERE t.status IN('pending','accepted','shipped','delivered') AND i.vault_card_id IS NOT NULL;
REVOKE INSERT,UPDATE,DELETE ON public.trades,public.trade_items FROM anon,authenticated;
CREATE FUNCTION public.trade_has_issue(p_trade uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM trades t WHERE t.id=p_trade AND auth.uid() IN(t.from_user,t.to_user)) AND EXISTS(SELECT 1 FROM trade_issues WHERE trade_id=p_trade AND resolved_at IS NULL) $$;
REVOKE ALL ON FUNCTION public.trade_has_issue(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.trade_has_issue(uuid) TO authenticated;
CREATE FUNCTION public.trade_protect_vault() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF EXISTS(SELECT 1 FROM trade_card_locks WHERE vault_card_id=OLD.id) THEN
IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Locked in trade: cannot remove card'; END IF;
IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.status IS DISTINCT FROM OLD.status OR NEW.is_sold IS DISTINCT FROM OLD.is_sold OR NEW.listed_listing_id IS DISTINCT FROM OLD.listed_listing_id OR NEW.accept_trades IS DISTINCT FROM OLD.accept_trades OR NEW.trade_plus_cash IS DISTINCT FROM OLD.trade_plus_cash OR NEW.accept_offers IS DISTINCT FROM OLD.accept_offers OR NEW.collection_only IS DISTINCT FROM OLD.collection_only THEN RAISE EXCEPTION 'Locked in trade: cannot sell or reoffer card'; END IF;
END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER trade_protect_vault BEFORE UPDATE OR DELETE ON public.vault_cards FOR EACH ROW EXECUTE FUNCTION public.trade_protect_vault();
CREATE FUNCTION public.trade_protect_listing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.vault_card_id IS NOT NULL THEN
PERFORM 1 FROM vault_cards WHERE id=NEW.vault_card_id FOR UPDATE;
IF EXISTS(SELECT 1 FROM trade_card_locks WHERE vault_card_id=NEW.vault_card_id) THEN RAISE EXCEPTION 'Locked in trade: cannot list card'; END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER trade_protect_listing BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trade_protect_listing();
REVOKE ALL ON FUNCTION public.trade_protect_vault(),public.trade_protect_listing() FROM PUBLIC,anon,authenticated;