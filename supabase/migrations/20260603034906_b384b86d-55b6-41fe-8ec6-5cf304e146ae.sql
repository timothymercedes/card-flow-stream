REVOKE EXECUTE ON FUNCTION public.award_credits(bigint, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_reward(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_reward_progress(text, integer, integer, text, text) FROM PUBLIC, anon;