-- Publication gate.
--
-- Until now every row in public.books was readable by anyone the moment it was
-- created, so a freshly generated book reached the bookshelf — and therefore
-- every child using the app — with no human ever having looked at it. For a
-- children's app carrying AI-written text and AI-painted pictures that is the
-- wrong default.
--
-- A book is now invisible until someone publishes it. The rule lives in RLS
-- rather than in a query, so it holds even if a client is tampered with.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Books that already exist were made by the project owner before this gate
-- existed, so they stay visible and today's app keeps working. They have NOT
-- been reviewed: reviewed_at is deliberately left null so they can be told
-- apart from anything approved from here on.
UPDATE public.books SET published = true WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS books_published_created_idx
  ON public.books (published, created_at DESC);

DROP POLICY IF EXISTS "Books are publicly readable" ON public.books;
CREATE POLICY "Published books are readable"
  ON public.books FOR SELECT
  USING (published = true);

-- A chapter follows its book: unpublished book, unreadable chapters.
DROP POLICY IF EXISTS "Chapters are publicly readable" ON public.chapters;
CREATE POLICY "Chapters of published books are readable"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = chapters.book_id AND b.published
    )
  );
