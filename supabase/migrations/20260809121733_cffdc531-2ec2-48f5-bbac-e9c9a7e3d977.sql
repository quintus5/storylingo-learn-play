ALTER TABLE public.books ADD COLUMN IF NOT EXISTS title_th text, ADD COLUMN IF NOT EXISTS blurb_th text;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS title_th text;