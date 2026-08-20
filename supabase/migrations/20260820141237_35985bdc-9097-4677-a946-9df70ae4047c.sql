GRANT INSERT ON public.book_reports TO authenticated;
CREATE POLICY "Signed-in people can submit reports" ON public.book_reports
  FOR INSERT TO authenticated WITH CHECK (reported_by = auth.uid());