REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_sale(jsonb, uuid, numeric, numeric, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pay_debt(uuid, numeric, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.produce_recipe(uuid, numeric, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, uuid, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_debt(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produce_recipe(uuid, numeric, text) TO authenticated;