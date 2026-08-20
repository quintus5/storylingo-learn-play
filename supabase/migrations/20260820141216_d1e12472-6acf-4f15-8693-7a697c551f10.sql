ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS books_owner_id_idx ON public.books(owner_id);

DROP POLICY IF EXISTS "Books are publicly readable" ON public.books;
CREATE POLICY "Published books are readable" ON public.books
  FOR SELECT USING (published = true OR owner_id = auth.uid());

GRANT SELECT ON public.books TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
GRANT SELECT ON public.chapters TO anon;
GRANT SELECT ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;

CREATE TABLE IF NOT EXISTS public.book_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_idx integer,
  reason text NOT NULL,
  note text,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.book_reports TO service_role;
ALTER TABLE public.book_reports ENABLE ROW LEVEL SECURITY;