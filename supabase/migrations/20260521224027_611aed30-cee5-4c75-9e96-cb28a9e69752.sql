CREATE OR REPLACE FUNCTION public.notifications_validate_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_count int;
  allowed_types text[] := ARRAY[
    'won','sale','order','payment','payment_failed','payment_pending',
    'follow','like','comment','mention','reply','dm','message',
    'collab_invite','collab_join','collab_request','collab_accepted',
    'giveaway','giveaway_win','tip','shoutout','ko_request','ko_accepted',
    'verification','verification_request','seller_agreement_reaccept','dispute','dispute_update',
    'shipping','shipped','delivered','listing','listing_sold','offer',
    'system','announcement','warning','support',
    'seller_live','order_packed','order_ready_for_dropoff','order_shipped','order_delivered','order_cancelled'
  ];
BEGIN
  NEW.sender_id := auth.uid();

  IF NEW.body IS NULL OR length(NEW.body) = 0 OR length(NEW.body) > 500 THEN
    RAISE EXCEPTION 'Notification body must be 1..500 chars';
  END IF;
  IF NEW.type IS NULL OR length(NEW.type) > 32 THEN
    RAISE EXCEPTION 'Invalid notification type';
  END IF;
  IF NOT (NEW.type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Notification type % is not allowed', NEW.type;
  END IF;
  IF NEW.link IS NOT NULL THEN
    IF length(NEW.link) > 200 THEN
      RAISE EXCEPTION 'Notification link too long';
    END IF;
    IF left(NEW.link, 1) <> '/' THEN
      RAISE EXCEPTION 'Notification link must be an internal path starting with /';
    END IF;
  END IF;

  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM public.notifications
  WHERE sender_id = auth.uid()
    AND user_id <> auth.uid()
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 60 THEN
    RAISE EXCEPTION 'Notification rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$function$;