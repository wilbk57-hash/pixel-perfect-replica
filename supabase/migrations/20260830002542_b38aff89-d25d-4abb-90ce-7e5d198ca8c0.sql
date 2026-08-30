ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

DROP POLICY IF EXISTS "Users manage own product images" ON storage.objects;
CREATE POLICY "Users manage own product images" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);