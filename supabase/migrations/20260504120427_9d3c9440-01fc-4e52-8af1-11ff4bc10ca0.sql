DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='break_slots') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.break_slots';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stream_chat_actions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_chat_actions';
  END IF;
END $$;

ALTER TABLE public.live_streams REPLICA IDENTITY FULL;
ALTER TABLE public.break_slots REPLICA IDENTITY FULL;
ALTER TABLE public.stream_chat_actions REPLICA IDENTITY FULL;