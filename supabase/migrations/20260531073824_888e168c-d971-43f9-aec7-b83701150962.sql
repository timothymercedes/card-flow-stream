UPDATE public.vault_cards
SET price_locked = true,
    needs_review = false,
    review_reason = NULL
WHERE (confirmed_by IS NOT NULL
       OR price_source IN ('user_confirmed', 'manual_entry'))
  AND status IS DISTINCT FROM 'sold';