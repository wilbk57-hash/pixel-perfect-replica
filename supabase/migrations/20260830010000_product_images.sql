-- Column to store the AI-generated (or manually set) product photo URL
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';

-- Public storage bucket to hold generated product photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view product photos (needed so <img> tags load them in the app)
CREATE POLICY "public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Each user can only upload/replace/delete photos inside their own folder (userId/...)
CREATE POLICY "users manage own product images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
