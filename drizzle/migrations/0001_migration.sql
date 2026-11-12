-- 1. Service-only financial/identity helpers
REVOKE EXECUTE ON FUNCTION public.apply_hold_recovery(uuid,bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_payout_to_orders(uuid,integer,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_merge_identities(uuid,uuid,uuid[],text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_stream_minutes(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_credits(bigint,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_xp(integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_quest_progress(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_reward_progress(text,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_reward(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hold_recovery(uuid,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_payout_to_orders(uuid,integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_merge_identities(uuid,uuid,uuid[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_stream_minutes(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_credits(bigint,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_xp(integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_quest_progress(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_reward_progress(text,integer,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_reward(text,text,text) TO service_role;

-- Service-only wrappers that run reward RPCs for a server-verified user
CREATE OR REPLACE FUNCTION public.record_reward_progress_for(_user_id uuid, _def_slug text, _progress integer, _target integer, _context_key text DEFAULT '', _context_label text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
  PERFORM public.record_reward_progress(_def_slug, _progress, _target, _context_key, _context_label);
END $$;

CREATE OR REPLACE FUNCTION public.claim_reward_for(_user_id uuid, _def_slug text, _context_key text DEFAULT '', _context_label text DEFAULT NULL)
RETURNS TABLE(granted boolean, credits integer, xp integer, badge_slug text, title text, description text, new_balance bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _user_id, 'role', 'authenticated')::text, true);
  RETURN QUERY SELECT * FROM public.claim_reward(_def_slug, _context_key, _context_label);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_reward_progress_for(uuid,text,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_reward_for(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reward_progress_for(uuid,text,integer,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_reward_for(uuid,text,text,text) TO service_role;

-- 2. Stream minutes computed from the host's own stream timestamps
ALTER TABLE public.live_streams ADD COLUMN IF NOT EXISTS minutes_credited integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.record_stream_minutes(_stream_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; total int; delta int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, seller_id, started_at, ended_at, minutes_credited INTO s
    FROM public.live_streams WHERE id = _stream_id FOR UPDATE;
  IF s.id IS NULL OR s.seller_id <> auth.uid() OR s.started_at IS NULL THEN RETURN 0; END IF;
  total := LEAST(1440, GREATEST(0, floor(extract(epoch FROM (COALESCE(s.ended_at, now()) - s.started_at)) / 60)::int));
  delta := total - COALESCE(s.minutes_credited, 0);
  IF delta <= 0 THEN RETURN 0; END IF;
  UPDATE public.live_streams SET minutes_credited = total WHERE id = _stream_id;
  PERFORM public.add_stream_minutes(s.seller_id, delta);
  RETURN delta;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_stream_minutes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stream_minutes(uuid) TO authenticated, service_role;

-- 3. Bid XP/quest progress granted by the database when a real bid is recorded
CREATE OR REPLACE FUNCTION public.award_bid_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.bidder_id THEN
    BEGIN
      PERFORM public.award_xp(2, 'bid', NEW.stream_id::text);
      PERFORM public.bump_quest_progress('daily_bid', 1);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.award_bid_progress() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_award_bid_progress ON public.live_bids;
CREATE TRIGGER trg_award_bid_progress AFTER INSERT ON public.live_bids
  FOR EACH ROW EXECUTE FUNCTION public.award_bid_progress();

-- 4. Break slot claims create unpaid orders (payment collected separately)
CREATE OR REPLACE FUNCTION public.claim_break_slots(_stream_id uuid, _slot_numbers integer[])
 RETURNS TABLE(order_id uuid, claimed_count integer, total_amount numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _buyer uuid := auth.uid(); _seller uuid; _stream_title text; _slot_count integer; _price numeric;
  _prefix text; _characters jsonb; _item_image text; _username text; _full_name text; _address text;
  _city text; _state text; _zip text; _country text; _nums integer[]; _labels text[]; _order_id uuid;
BEGIN
  IF _buyer IS NULL THEN RAISE EXCEPTION 'You must be signed in to claim a character'; END IF;
  SELECT ls.seller_id, ls.title, ls.break_slot_count, COALESCE(ls.break_slot_price, 10), ls.break_slot_prefix,
         ls.break_characters, COALESCE(ls.item_image_url, ls.thumbnail_url)
    INTO _seller, _stream_title, _slot_count, _price, _prefix, _characters, _item_image
  FROM public.live_streams ls WHERE ls.id = _stream_id AND ls.break_mode = 'open' FOR UPDATE;
  IF _seller IS NULL THEN RAISE EXCEPTION 'This break is not open'; END IF;
  IF _seller = _buyer THEN RAISE EXCEPTION 'Host cannot claim their own break slots'; END IF;
  SELECT array_agg(DISTINCT n ORDER BY n) INTO _nums
  FROM unnest(COALESCE(_slot_numbers, ARRAY[]::integer[])) AS n WHERE n BETWEEN 1 AND COALESCE(_slot_count, 0);
  IF _nums IS NULL OR array_length(_nums, 1) IS NULL THEN RAISE EXCEPTION 'Choose at least one available character'; END IF;
  IF array_length(_nums, 1) > 10 THEN RAISE EXCEPTION 'Claim up to 10 characters at a time'; END IF;
  IF EXISTS (SELECT 1 FROM public.break_slots bs WHERE bs.stream_id = _stream_id AND bs.slot_number = ANY(_nums)) THEN
    RAISE EXCEPTION 'One of those characters was just claimed';
  END IF;
  SELECT COALESCE(p.username, 'buyer'), COALESCE(p.full_name, p.username, 'Buyer'), COALESCE(p.address_line1, ''),
         COALESCE(p.address_city, ''), COALESCE(p.address_state, ''), COALESCE(p.address_zip, ''), COALESCE(p.address_country, 'US')
    INTO _username, _full_name, _address, _city, _state, _zip, _country
  FROM public.profiles p WHERE p.id = _buyer;
  SELECT array_agg(COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text) ORDER BY n)
    INTO _labels FROM unnest(_nums) AS n;
  INSERT INTO public.orders (buyer_id, seller_id, title, description, amount, item_image_url, stream_id, status,
    payment_status, paid_at, ship_name, ship_address, ship_city, ship_state, ship_zip, ship_country)
  VALUES (_buyer, _seller,
    'Mystery Break — ' || array_length(_nums, 1)::text || ' character' || CASE WHEN array_length(_nums, 1) = 1 THEN '' ELSE 's' END,
    'Mystery Break in ' || COALESCE(_stream_title, 'live stream') || ': ' || array_to_string(_labels, ', '),
    _price * array_length(_nums, 1), _item_image, _stream_id, 'pending',
    CASE WHEN _price * array_length(_nums, 1) > 0 THEN 'awaiting_payment' ELSE 'paid' END,
    CASE WHEN _price * array_length(_nums, 1) > 0 THEN NULL ELSE now() END,
    _full_name, _address, _city, _state, _zip, _country)
  RETURNING id INTO _order_id;
  INSERT INTO public.break_slots (stream_id, buyer_id, buyer_username, amount, slot_number, character_label, team_label, assigned_at, order_id)
  SELECT _stream_id, _buyer, _username, _price, n,
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text),
         COALESCE(NULLIF(_characters ->> (n - 1), ''), COALESCE(_prefix, '#') || n::text), now(), _order_id
  FROM unnest(_nums) AS n;
  order_id := _order_id; claimed_count := array_length(_nums, 1); total_amount := _price * claimed_count;
  RETURN NEXT;
END;
$function$;

-- 5. Arena companion stats are server-managed only
DROP POLICY IF EXISTS "Owners manage own companions" ON public.arena_companions;
CREATE POLICY "Owners view own companions" ON public.arena_companions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners delete own companions" ON public.arena_companions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. Staff cannot modify their own repayment holds
DROP POLICY IF EXISTS "Staff update holds" ON public.account_holds;
CREATE POLICY "Staff update holds" ON public.account_holds FOR UPDATE TO authenticated
USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'support')) AND user_id <> auth.uid())
WITH CHECK ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'support')) AND user_id <> auth.uid());

-- 7. Tighten private-by-nature tables
DROP POLICY IF EXISTS "Public read store names" ON public.store_name_history;
CREATE POLICY "Owner or staff read store names" ON public.store_name_history FOR SELECT TO authenticated
USING (auth.uid() = seller_id OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner'));
DROP POLICY IF EXISTS "Vault settings viewable by all" ON public.vault_settings;
CREATE POLICY "Owners view own vault settings" ON public.vault_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user rewards public read" ON public.user_rewards;
DROP POLICY IF EXISTS "Goals are viewable by everyone" ON public.collection_goals;
CREATE POLICY "Users view own goals" ON public.collection_goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Streaks are viewable by everyone" ON public.collection_streaks;
DROP POLICY IF EXISTS "anyone can request beta access" ON public.beta_access_requests;
