
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chat_messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name='chat_content_max_length')
  THEN
    ALTER TABLE public.chat_messages ADD CONSTRAINT chat_content_max_length CHECK (length(content) <= 2000) NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stream_mod_messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name='stream_mod_content_max_length')
  THEN
    ALTER TABLE public.stream_mod_messages ADD CONSTRAINT stream_mod_content_max_length CHECK (length(content) <= 2000) NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='direct_messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name='direct_message_content_max_length')
  THEN
    ALTER TABLE public.direct_messages ADD CONSTRAINT direct_message_content_max_length CHECK (length(content) <= 4000) NOT VALID;
  END IF;
END $$;
