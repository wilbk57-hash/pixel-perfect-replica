
REVOKE ALL ON FUNCTION public.set_business_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sale(jsonb, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_debt(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.produce_recipe(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_recipe(uuid, text, uuid, numeric, numeric, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_employee(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_employee(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_employees() FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Users manage own product images" ON storage.objects;
CREATE POLICY "Business members manage product images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.business_id(auth.uid())::text)
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.business_id(auth.uid())::text);

UPDATE public.products SET image_url = NULL WHERE image_url LIKE '%/object/public/product-images/%';
