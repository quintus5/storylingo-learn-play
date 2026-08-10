ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS cast_bible jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS places jsonb NOT NULL DEFAULT '[]'::jsonb;