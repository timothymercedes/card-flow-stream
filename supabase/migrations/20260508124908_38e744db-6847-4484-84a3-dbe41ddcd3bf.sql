ALTER TABLE public.tutorials ALTER COLUMN video_url DROP NOT NULL;
UPDATE public.tutorials SET video_url = NULL, captions_url = NULL;