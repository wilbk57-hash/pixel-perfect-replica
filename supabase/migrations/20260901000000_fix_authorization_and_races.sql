-- ============================================================
-- CORREÇÃO DE SEGURANÇA E CONCORRÊNCIA — 01/09/2026
-- Resolve os itens Críticos 1, 2, 3, 4 e Importante 5 e 9
-- do relatório de análise de 31/08.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Repor as permissões que a migração 20260831125818 retirou.
--    products_secure / sales_secure / sale_items_secure são views
--    "security_invoker" e chamam has_role()/business_id() como o
--    próprio utilizador (authenticated) — sem isto, param de
--    funcionar para todos, dono incluído.
-- ----------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_id(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 2) Unificar os dois sistemas de "dono efetivo" num só.
--    business_id() passa a olhar também para business_members,
--    para funcionários associados pelo sistema antigo (via
--    "Equipa" no menu) continuarem a funcionar mesmo que
--    user_roles.owner_id nunca tenha sido preenchido para eles.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT owner_id FROM public.user_roles WHERE user_id = _user_id AND role = 'funcionario' LIMIT 1),
    (SELECT owner_id FROM public.business_members WHERE employee_user_id = _user_id LIMIT 1),
    _user_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.my_business_id()
 RETURNS uuid
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.business_id(auth.uid()) END
$function$;

CREATE OR REPLACE FUNCTION public.effective_owner_id()
 RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.business_id(auth.uid())
$$;

-- ----------------------------------------------------------------
-- 3) Remover os triggers e políticas antigos e duplicados
--    (fica só trg_set_business_id / as novas políticas abaixo,
--    que já cobrem os dois sistemas via business_id()).
-- ----------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'categories','products','customers','sales','sale_items',
    'customer_debts','customer_payments','inventory_movements',
    'recipes','recipe_ingredients','production_orders','debt_reminders'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_owner ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "own %s" ON public.%I', t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 4) Ninguém lê produtos/vendas/itens de venda pela tabela crua a
--    partir de agora — só pelas views *_secure (onde o custo/lucro
--    já fica escondido do funcionário). A escrita continua
--    permitida, regulada pelas políticas da secção 6.
-- ----------------------------------------------------------------
REVOKE SELECT ON public.products FROM authenticated;
REVOKE SELECT ON public.sales FROM authenticated;
REVOKE SELECT ON public.sale_items FROM authenticated;
GRANT SELECT ON public.products_secure TO authenticated;
GRANT SELECT ON public.sales_secure TO authenticated;
GRANT SELECT ON public.sale_items_secure TO authenticated;

-- ----------------------------------------------------------------
-- 5) Tabelas que só podem mudar através das funções RPC
--    (create_sale, pay_debt, adjust_stock, produce_recipe,
--    save_recipe) deixam de aceitar INSERT/UPDATE/DELETE direto.
--    As funções continuam a funcionar: correm SECURITY DEFINER
--    como dono das tabelas, não como o utilizador autenticado.
-- ----------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.sales FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sale_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customer_debts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customer_payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.production_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.recipes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.recipe_ingredients FROM authenticated;

-- ----------------------------------------------------------------
-- 6) Produtos e categorias: só o Dono pode criar/editar/apagar
--    diretamente (já são telas "adminOnly" na navegação — isto
--    fecha a mesma porta do lado do servidor).
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "shared business products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated
  USING (user_id = public.business_id(auth.uid()));
CREATE POLICY "insert products (dono)" ON public.products FOR INSERT TO authenticated
  WITH CHECK (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));
CREATE POLICY "update products (dono)" ON public.products FOR UPDATE TO authenticated
  USING (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'))
  WITH CHECK (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));
CREATE POLICY "delete products (dono)" ON public.products FOR DELETE TO authenticated
  USING (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));

DROP POLICY IF EXISTS "shared business categories" ON public.categories;
CREATE POLICY "read categories" ON public.categories FOR SELECT TO authenticated
  USING (user_id = public.business_id(auth.uid()));
CREATE POLICY "insert categories (dono)" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));
CREATE POLICY "update categories (dono)" ON public.categories FOR UPDATE TO authenticated
  USING (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'))
  WITH CHECK (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));
CREATE POLICY "delete categories (dono)" ON public.categories FOR DELETE TO authenticated
  USING (user_id = public.business_id(auth.uid()) AND public.has_role(auth.uid(), 'dono'));

-- Vendas / itens de venda: leitura para os dois papéis (o esconder de
-- lucro já é feito pelas views _secure); escrita só pelas funções RPC.
DROP POLICY IF EXISTS "shared business sales" ON public.sales;
CREATE POLICY "read sales" ON public.sales FOR SELECT TO authenticated
  USING (user_id = public.business_id(auth.uid()));

DROP POLICY IF EXISTS "shared business sale_items" ON public.sale_items;
CREATE POLICY "read sale_items" ON public.sale_items FOR SELECT TO authenticated
  USING (user_id = public.business_id(auth.uid()));

-- customer_debts / customer_payments / inventory_movements / production_orders
-- / recipes / recipe_ingredients: mantêm a política "shared business X" já
-- existente (cobre a leitura); a escrita direta já foi revogada na secção 5,
-- por isso não é preciso duplicar políticas de escrita para estas tabelas.

-- ----------------------------------------------------------------
-- 7) Idempotência: registo de ações offline já processadas, para a
--    fila de sincronização nunca duplicar uma venda/pagamento/ajuste
--    se a resposta do servidor se perder a meio do caminho.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offline_action_log (
  client_action_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  result_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offline_action_log ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só é acedida de dentro das funções abaixo (SECURITY DEFINER).

-- ----------------------------------------------------------------
-- 8) Funções de negócio: FOR UPDATE (corrige a condição de corrida)
--    + parâmetro opcional p_client_action_id (corrige duplicação).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_discount NUMERIC DEFAULT 0,
  p_paid NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'CASH',
  p_notes TEXT DEFAULT '',
  p_client_action_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
  v_sale UUID;
  v_item JSONB;
  v_prod RECORD;
  v_qty NUMERIC; v_price NUMERIC;
  v_sub NUMERIC := 0; v_cost NUMERIC := 0; v_count NUMERIC := 0;
  v_total NUMERIC; v_debt NUMERIC; v_change NUMERIC := 0;
  v_cust_name TEXT := 'Cliente não identificado';
  v_number TEXT;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.business_id(auth.uid());

  -- Se esta ação já foi processada antes (reenvio da fila offline),
  -- devolve o mesmo resultado sem repetir a venda.
  IF p_client_action_id IS NOT NULL THEN
    SELECT result_id INTO v_sale FROM public.offline_action_log WHERE client_action_id = p_client_action_id;
    IF v_sale IS NOT NULL THEN
      RETURN v_sale;
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT name INTO v_cust_name FROM customers WHERE id = p_customer_id AND user_id = v_user;
    IF v_cust_name IS NULL THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
  END IF;

  v_number := 'VEN-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM sales WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');

  -- Bloqueia (FOR UPDATE) todas as linhas de produto envolvidas ANTES
  -- de calcular totais, para impedir que outra venda em simultâneo
  -- altere o stock destes produtos a meio deste pedido.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM products
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_user
      FOR UPDATE;
    IF v_prod IS NULL THEN RAISE EXCEPTION 'Produto inválido'; END IF;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, v_prod.sale_price);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    IF v_prod.current_stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_prod.name; END IF;
    v_sub := v_sub + v_qty * v_price;
    v_cost := v_cost + v_qty * v_prod.cost_price;
    v_count := v_count + v_qty;
  END LOOP;

  v_total := GREATEST(v_sub - COALESCE(p_discount,0), 0);
  IF p_paid >= v_total THEN v_change := p_paid - v_total; v_debt := 0;
  ELSE v_debt := v_total - p_paid; END IF;
  IF v_debt > 0 AND p_customer_id IS NULL THEN RAISE EXCEPTION 'Venda a crédito exige um cliente'; END IF;
  v_status := CASE WHEN v_debt = 0 THEN 'PAID' WHEN p_paid > 0 THEN 'PARTIAL' ELSE 'UNPAID' END;

  INSERT INTO sales (user_id, sale_number, customer_id, customer_name, total_items, subtotal, discount_amount,
    final_total, cost_total, gross_profit, paid_amount, change_amount, remaining_debt, payment_method, payment_status, notes)
  VALUES (v_user, v_number, p_customer_id, v_cust_name, v_count, v_sub, COALESCE(p_discount,0), v_total, v_cost,
    v_total - v_cost, LEAST(p_paid, v_total), v_change, v_debt, p_payment_method, v_status, COALESCE(p_notes,''))
  RETURNING id INTO v_sale;

  -- As linhas já estão bloqueadas desde o passo anterior — este
  -- segundo SELECT lê sempre o stock correto.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM products WHERE id = (v_item->>'product_id')::uuid AND user_id = v_user;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, v_prod.sale_price);
    INSERT INTO sale_items (user_id, sale_id, product_id, product_name, product_unit, quantity, unit_price, cost_price, subtotal, profit)
    VALUES (v_user, v_sale, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_price, v_prod.cost_price,
      v_qty * v_price, v_qty * (v_price - v_prod.cost_price));
    UPDATE products SET current_stock = current_stock - v_qty WHERE id = v_prod.id;
    INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reference_id, reason)
    VALUES (v_user, v_prod.id, v_prod.name, 'SALE', -v_qty, v_prod.current_stock, v_prod.current_stock - v_qty, v_number, 'Venda ' || v_number);
  END LOOP;

  IF p_customer_id IS NOT NULL THEN
    UPDATE customers SET total_spent = total_spent + v_total,
      current_debt = current_debt + v_debt WHERE id = p_customer_id;
    IF v_debt > 0 THEN
      INSERT INTO customer_debts (user_id, customer_id, customer_name, sale_id, sale_number, original_amount, remaining_amount)
      VALUES (v_user, p_customer_id, v_cust_name, v_sale, v_number, v_debt, v_debt);
    END IF;
  END IF;

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type, result_id)
    VALUES (p_client_action_id, v_user, 'sale', v_sale)
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;

  RETURN v_sale;
END; $$;
REVOKE ALL ON FUNCTION public.create_sale(JSONB, UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(JSONB, UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_debt(
  p_debt_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'CASH', p_notes TEXT DEFAULT '',
  p_client_action_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_debt RECORD; v_pay NUMERIC; v_num TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_client_action_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.offline_action_log WHERE client_action_id = p_client_action_id
  ) THEN
    RETURN; -- já processado antes
  END IF;

  v_user := public.business_id(auth.uid());
  SELECT * INTO v_debt FROM customer_debts WHERE id = p_debt_id AND user_id = v_user FOR UPDATE;
  IF v_debt IS NULL THEN RAISE EXCEPTION 'Dívida não encontrada'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  v_pay := LEAST(p_amount, v_debt.remaining_amount);
  v_num := 'REC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM customer_payments WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');
  UPDATE customer_debts SET paid_amount = paid_amount + v_pay, remaining_amount = remaining_amount - v_pay,
    status = CASE WHEN remaining_amount - v_pay <= 0 THEN 'PAID' ELSE 'PARTIAL' END WHERE id = p_debt_id;
  UPDATE customers SET current_debt = GREATEST(current_debt - v_pay, 0) WHERE id = v_debt.customer_id;
  INSERT INTO customer_payments (user_id, customer_id, customer_name, debt_id, payment_number, amount, payment_method, notes)
  VALUES (v_user, v_debt.customer_id, v_debt.customer_name, p_debt_id, v_num, v_pay, p_method, COALESCE(p_notes,''));

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type)
    VALUES (p_client_action_id, v_user, 'pay_debt')
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.pay_debt(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_debt(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id UUID, p_quantity NUMERIC, p_type TEXT, p_reason TEXT DEFAULT '',
  p_client_action_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_prod RECORD; v_new NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_client_action_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.offline_action_log WHERE client_action_id = p_client_action_id
  ) THEN
    RETURN; -- já processado antes
  END IF;

  v_user := public.business_id(auth.uid());
  SELECT * INTO v_prod FROM products WHERE id = p_product_id AND user_id = v_user FOR UPDATE;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  v_new := v_prod.current_stock + p_quantity;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque não pode ficar negativo'; END IF;
  UPDATE products SET current_stock = v_new WHERE id = p_product_id;
  INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
  VALUES (v_user, p_product_id, v_prod.name, p_type, p_quantity, v_prod.current_stock, v_new, COALESCE(p_reason,''));

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type)
    VALUES (p_client_action_id, v_user, 'adjust_stock')
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.produce_recipe(p_recipe_id UUID, p_batches NUMERIC DEFAULT 1, p_notes TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID; v_recipe RECORD; v_ing RECORD; v_prod RECORD;
  v_cost NUMERIC := 0; v_qty NUMERIC; v_produced NUMERIC; v_order UUID; v_new NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.business_id(auth.uid());
  IF p_batches <= 0 THEN RAISE EXCEPTION 'Número de lotes inválido'; END IF;
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id AND user_id = v_user;
  IF v_recipe IS NULL THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;

  FOR v_ing IN SELECT * FROM recipe_ingredients WHERE recipe_id = p_recipe_id AND user_id = v_user LOOP
    SELECT * INTO v_prod FROM products WHERE id = v_ing.product_id AND user_id = v_user FOR UPDATE;
    IF v_prod IS NULL THEN RAISE EXCEPTION 'Ingrediente inválido'; END IF;
    v_qty := v_ing.quantity * p_batches;
    IF v_prod.current_stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente de %', v_prod.name; END IF;
    v_cost := v_cost + v_qty * v_prod.cost_price;
  END LOOP;
  v_cost := v_cost + v_recipe.additional_cost * p_batches;
  v_produced := v_recipe.yield_quantity * p_batches;

  FOR v_ing IN SELECT * FROM recipe_ingredients WHERE recipe_id = p_recipe_id AND user_id = v_user LOOP
    SELECT * INTO v_prod FROM products WHERE id = v_ing.product_id AND user_id = v_user;
    v_qty := v_ing.quantity * p_batches;
    v_new := v_prod.current_stock - v_qty;
    UPDATE products SET current_stock = v_new WHERE id = v_prod.id;
    INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
    VALUES (v_user, v_prod.id, v_prod.name, 'PRODUCTION', -v_qty, v_prod.current_stock, v_new, 'Produção: ' || v_recipe.name);
  END LOOP;

  INSERT INTO production_orders (user_id, recipe_id, recipe_name, product_id, product_name, batches, produced_quantity, total_cost, unit_cost, notes)
  VALUES (v_user, p_recipe_id, v_recipe.name, v_recipe.product_id, v_recipe.product_name, p_batches, v_produced, v_cost,
    CASE WHEN v_produced > 0 THEN v_cost / v_produced ELSE 0 END, COALESCE(p_notes,''))
  RETURNING id INTO v_order;

  IF v_recipe.product_id IS NOT NULL THEN
    SELECT * INTO v_prod FROM products WHERE id = v_recipe.product_id AND user_id = v_user FOR UPDATE;
    IF v_prod IS NOT NULL THEN
      v_new := v_prod.current_stock + v_produced;
      UPDATE products SET current_stock = v_new,
        cost_price = CASE WHEN v_produced > 0 THEN v_cost / v_produced ELSE cost_price END
        WHERE id = v_prod.id;
      INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
      VALUES (v_user, v_prod.id, v_prod.name, 'PRODUCTION', v_produced, v_prod.current_stock, v_new, 'Produção: ' || v_recipe.name);
    END IF;
  END IF;

  RETURN v_order;
END; $$;
REVOKE ALL ON FUNCTION public.produce_recipe(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_recipe(UUID, NUMERIC, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 9) Bucket de imagens de produto passa a público — resolve o link
--    assinado que expirava ao fim de 1 ano (não há dados sensíveis
--    numa foto de produto).
-- ----------------------------------------------------------------
UPDATE storage.buckets SET public = true WHERE id = 'product-images';
