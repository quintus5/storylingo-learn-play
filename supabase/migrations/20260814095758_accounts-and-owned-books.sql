-- Accounts, and books that belong to somebody.
--
-- Anyone may make a book again, but a new book is now private to the person
-- who made it rather than landing on the shelf every child sees. Publishing to
-- the shared shelf stays a separate, reviewed step.
--
-- That split is what makes open creation workable: a book a child made for
-- themselves reaches one household, and only content someone has actually read
-- is broadcast to everyone.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- The shelf lists a reader's own books newest-first alongside the catalogue.
CREATE INDEX IF NOT EXISTS books_owner_created_idx
  ON public.books (owner_id, created_at DESC);

-- Books that predate accounts have no owner. They are already published, so
-- they stay readable through the published branch of the policy below.
DROP POLICY IF EXISTS "Published books are readable" ON public.books;
CREATE POLICY "Published books, and your own, are readable"
  ON public.books FOR SELECT
  USING (published = true OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Chapters of published books are readable" ON public.chapters;
CREATE POLICY "Chapters follow their book"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = chapters.book_id
        AND (b.published = true OR b.owner_id = auth.uid())
    )
  );

-- Reports of anything a reader thinks is wrong with a book. Play's generative
-- AI rules expect a way to flag output from inside the app, and it is also the
-- cheapest signal we get that a published book should come back down.
CREATE TABLE IF NOT EXISTS public.book_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_idx integer,
  reason text NOT NULL,
  note text,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.book_reports TO authenticated;
GRANT ALL ON public.book_reports TO service_role;

-- Anyone signed in may report a book; nobody may read the reports back. Only
-- the operator, through the service role, sees what has been flagged.
CREATE POLICY "Signed-in readers may report a book"
  ON public.book_reports FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE INDEX IF NOT EXISTS book_reports_book_idx
  ON public.book_reports (book_id, created_at DESC);
