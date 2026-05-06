UPDATE public.creator_stream_tiers
SET inactive_warning_minutes = 45,
    inactive_auto_end_minutes = 60;

INSERT INTO public.creator_stream_tiers (tier, label, inactive_warning_minutes, inactive_auto_end_minutes, flex_soft_limit_minutes, flex_extension_minutes, guest_limit, priority_stream_quality, enhanced_obs_features)
VALUES ('standard', 'Standard', 45, 60, 180, 120, 4, false, false)
ON CONFLICT (tier) DO UPDATE
SET inactive_warning_minutes = EXCLUDED.inactive_warning_minutes,
    inactive_auto_end_minutes = EXCLUDED.inactive_auto_end_minutes;