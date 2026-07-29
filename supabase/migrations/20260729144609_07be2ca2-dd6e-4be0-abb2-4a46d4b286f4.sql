-- storage.objects already has RLS enabled with no policies (implicit deny).
-- Make the intent explicit so the private 'story-art' bucket has enforced,
-- auditable rules. Only the server (service_role, which bypasses RLS) may
-- read or write art; clients get art through /api/public/art/*.

DROP POLICY IF EXISTS "story_art_no_client_select" ON storage.objects;
DROP POLICY IF EXISTS "story_art_no_client_insert" ON storage.objects;
DROP POLICY IF EXISTS "story_art_no_client_update" ON storage.objects;
DROP POLICY IF EXISTS "story_art_no_client_delete" ON storage.objects;

CREATE POLICY "story_art_no_client_select"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (false);

CREATE POLICY "story_art_no_client_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "story_art_no_client_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "story_art_no_client_delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (false);