
-- Tighten giveaway buyer eligibility to "buyers in THIS stream only".
DROP POLICY IF EXISTS "Viewer self-enters open giveaway" ON public.giveaway_entries;

CREATE POLICY "Viewer self-enters open giveaway"
ON public.giveaway_entries
FOR INSERT
WITH CHECK (
  (auth.uid() = user_id)
  AND EXISTS (
    SELECT 1 FROM public.giveaways g
    WHERE g.id = giveaway_entries.giveaway_id
      AND g.status = 'open'
      AND auth.uid() <> g.seller_id
      AND (
        g.eligibility = 'anyone'
        OR (g.eligibility = 'followers' AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.follower_id = auth.uid() AND f.followee_id = g.seller_id
        ))
        OR (g.eligibility = 'buyers' AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.buyer_id = auth.uid()
            AND o.seller_id = g.seller_id
            AND o.stream_id = g.stream_id
        ))
      )
  )
);
