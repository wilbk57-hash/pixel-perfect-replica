-- Vistas que escondem custo/lucro de quem não é "dono".
-- Continuam a respeitar a RLS das tabelas originais (multi-negócio,
-- dono/funcionário) porque usam security_invoker.

CREATE OR REPLACE VIEW public.products_secure
WITH (security_invoker = true) AS
SELECT
  id, user_id, category_id, name, description, unit,
  sale_price,
  CASE WHEN public.has_role(auth.uid(), 'dono') THEN cost_price ELSE NULL END AS cost_price,
  current_stock, min_stock, sku, status, product_type, image_url,
  created_at, updated_at
FROM public.products;

GRANT SELECT ON public.products_secure TO authenticated;

CREATE OR REPLACE VIEW public.sales_secure
WITH (security_invoker = true) AS
SELECT
  id, user_id, sale_number, customer_id, customer_name,
  total_items, subtotal, discount_amount, final_total,
  CASE WHEN public.has_role(auth.uid(), 'dono') THEN cost_total ELSE NULL END AS cost_total,
  CASE WHEN public.has_role(auth.uid(), 'dono') THEN gross_profit ELSE NULL END AS gross_profit,
  paid_amount, change_amount, remaining_debt, payment_method, payment_status, status, notes, created_at
FROM public.sales;

GRANT SELECT ON public.sales_secure TO authenticated;

CREATE OR REPLACE VIEW public.sale_items_secure
WITH (security_invoker = true) AS
SELECT
  id, user_id, sale_id, product_id, product_name, product_unit,
  quantity, unit_price,
  CASE WHEN public.has_role(auth.uid(), 'dono') THEN cost_price ELSE NULL END AS cost_price,
  subtotal,
  CASE WHEN public.has_role(auth.uid(), 'dono') THEN profit ELSE NULL END AS profit,
  created_at
FROM public.sale_items;

GRANT SELECT ON public.sale_items_secure TO authenticated;
