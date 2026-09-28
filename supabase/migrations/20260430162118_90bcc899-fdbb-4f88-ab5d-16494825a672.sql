
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "images_auth_delete" ON storage.objects;

CREATE POLICY "images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "images_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'images');
CREATE POLICY "images_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'images');
CREATE POLICY "images_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'images');
