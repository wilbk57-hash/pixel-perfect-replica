-- ============================================================
-- 1. Tabela de ligação funcionário → dono
-- ============================================================
CREATE TABLE public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id)
);
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
-- Sem policies: ninguém acede a esta tabela diretamente, só via funções abaixo.

-- ============================================================
-- 2. Função central: qual é o "dono efetivo" dos dados a mostrar?
--    - Se o utilizador é funcionário ligado a um dono, devolve o dono.
--    - Caso contrário (dono, ou funcionário ainda não associado), devolve ele próprio.
-- ============================================================
CREATE OR REPLACE FUNCTION public.effective_owner_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT owner_id FROM public.business_members WHERE employee_user_id = auth.uid()),
    auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.effective_owner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_owner_id() TO authenticated;

-- ============================================================
-- 3. Trigger: força user_id = dono efetivo em todas as tabelas de negócio,
--    mesmo que o código da app envie outro valor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_owner_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id := public.effective_owner_id();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_owner_user_id() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_categories_owner BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_products_owner BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_customers_owner BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_sales_owner BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_sale_items_owner BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_customer_debts_owner BEFORE INSERT ON public.customer_debts FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_customer_payments_owner BEFORE INSERT ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_inventory_movements_owner BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_recipes_owner BEFORE INSERT ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_recipe_ingredients_owner BEFORE INSERT ON public.recipe_ingredients FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_production_orders_owner BEFORE INSERT ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();
CREATE TRIGGER trg_debt_reminders_owner BEFORE INSERT ON public.debt_reminders FOR EACH ROW EXECUTE FUNCTION public.set_owner_user_id();

-- ============================================================
-- 4. RLS: trocar "user_id = auth.uid()" por "user_id = effective_owner_id()"
--    em todas as tabelas de negócio, para o funcionário ver os dados do dono.
-- ============================================================
DROP POLICY "own categories" ON public.categories;
CREATE POLICY "own categories" ON public.categories FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own products" ON public.products;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own customers" ON public.customers;
CREATE POLICY "own customers" ON public.customers FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own sales" ON public.sales;
CREATE POLICY "own sales" ON public.sales FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own sale items" ON public.sale_items;
CREATE POLICY "own sale items" ON public.sale_items FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own debts" ON public.customer_debts;
CREATE POLICY "own debts" ON public.customer_debts FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own customer payments" ON public.customer_payments;
CREATE POLICY "own customer payments" ON public.customer_payments FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own movements" ON public.inventory_movements;
CREATE POLICY "own movements" ON public.inventory_movements FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own recipes" ON public.recipes;
CREATE POLICY "own recipes" ON public.recipes FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "own recipe ingredients" ON public.recipe_ingredients FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own production" ON public.production_orders;
CREATE POLICY "own production" ON public.production_orders FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

DROP POLICY "own reminders" ON public.debt_reminders;
CREATE POLICY "own reminders" ON public.debt_reminders FOR ALL TO authenticated
  USING (user_id = public.effective_owner_id()) WITH CHECK (user_id = public.effective_owner_id());

-- ============================================================
-- 5. Atualizar as funções RPC existentes para operar sobre o dono efetivo
--    (mantêm a mesma lógica de negócio, só troca auth.uid() por effective_owner_id()
--     para leitura/escrita de dados — a verificação de autenticação continua por auth.uid()).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_sale(
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_discount NUMERIC DEFAULT 0,
  p_paid NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'CASH',
  p_notes TEXT DEFAULT ''
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
  v_user := public.effective_owner_id();

  IF p_customer_id IS NOT NULL THEN
    SELECT name INTO v_cust_name FROM customers WHERE id = p_customer_id AND user_id = v_user;
    IF v_cust_name IS NULL THEN RAISE EXCEPTION 'Cliente inválido'; END IF;
  END IF;

  v_number := 'VEN-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM sales WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_prod FROM products WHERE id = (v_item->>'product_id')::uuid AND user_id = v_user;
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

  RETURN v_sale;
END; $$;

CREATE OR REPLACE FUNCTION public.pay_debt(p_debt_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'CASH', p_notes TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_debt RECORD; v_pay NUMERIC; v_num TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.effective_owner_id();
  SELECT * INTO v_debt FROM customer_debts WHERE id = p_debt_id AND user_id = v_user;
  IF v_debt IS NULL THEN RAISE EXCEPTION 'Dívida não encontrada'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  v_pay := LEAST(p_amount, v_debt.remaining_amount);
  v_num := 'REC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM customer_payments WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');
  UPDATE customer_debts SET paid_amount = paid_amount + v_pay, remaining_amount = remaining_amount - v_pay,
    status = CASE WHEN remaining_amount - v_pay <= 0 THEN 'PAID' ELSE 'PARTIAL' END WHERE id = p_debt_id;
  UPDATE customers SET current_debt = GREATEST(current_debt - v_pay, 0) WHERE id = v_debt.customer_id;
  INSERT INTO customer_payments (user_id, customer_id, customer_name, debt_id, payment_number, amount, payment_method, notes)
  VALUES (v_user, v_debt.customer_id, v_debt.customer_name, p_debt_id, v_num, v_pay, p_method, COALESCE(p_notes,''));
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id UUID, p_quantity NUMERIC, p_type TEXT, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_prod RECORD; v_new NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.effective_owner_id();
  SELECT * INTO v_prod FROM products WHERE id = p_product_id AND user_id = v_user;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  v_new := v_prod.current_stock + p_quantity;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque não pode ficar negativo'; END IF;
  UPDATE products SET current_stock = v_new WHERE id = p_product_id;
  INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
  VALUES (v_user, p_product_id, v_prod.name, p_type, p_quantity, v_prod.current_stock, v_new, COALESCE(p_reason,''));
END; $$;

CREATE OR REPLACE FUNCTION public.produce_recipe(p_recipe_id UUID, p_batches NUMERIC DEFAULT 1, p_notes TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID; v_recipe RECORD; v_ing RECORD; v_prod RECORD;
  v_cost NUMERIC := 0; v_qty NUMERIC; v_produced NUMERIC; v_order UUID; v_new NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.effective_owner_id();
  IF p_batches <= 0 THEN RAISE EXCEPTION 'Número de lotes inválido'; END IF;
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id AND user_id = v_user;
  IF v_recipe IS NULL THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;

  FOR v_ing IN SELECT * FROM recipe_ingredients WHERE recipe_id = p_recipe_id AND user_id = v_user LOOP
    SELECT * INTO v_prod FROM products WHERE id = v_ing.product_id AND user_id = v_user;
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
    SELECT * INTO v_prod FROM products WHERE id = v_recipe.product_id AND user_id = v_user;
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

-- ============================================================
-- 6. Novas funções que o TeamDialog já chama e que ainda não existiam
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_employees()
RETURNS TABLE(user_id UUID, email TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bm.employee_user_id, u.email::text, bm.created_at
  FROM public.business_members bm
  JOIN auth.users u ON u.id = bm.employee_user_id
  WHERE bm.owner_id = auth.uid()
  ORDER BY bm.created_at;
$$;
REVOKE ALL ON FUNCTION public.list_employees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_employees() TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_employee(p_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target UUID;
  v_target_role public.app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'dono') THEN
    RAISE EXCEPTION 'Apenas o dono pode adicionar funcionários';
  END IF;

  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Não existe conta com este email. Peça à pessoa para criar conta primeiro.';
  END IF;

  IF v_target = auth.uid() THEN
    RAISE EXCEPTION 'Não pode adicionar-se a si próprio';
  END IF;

  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = v_target LIMIT 1;
  IF v_target_role IS DISTINCT FROM 'funcionario'::public.app_role THEN
    RAISE EXCEPTION 'Esta conta não é do tipo Funcionário';
  END IF;

  IF EXISTS (SELECT 1 FROM public.business_members WHERE employee_user_id = v_target) THEN
    RAISE EXCEPTION 'Esta pessoa já está associada a outro negócio';
  END IF;

  INSERT INTO public.business_members (owner_id, employee_user_id)
  VALUES (auth.uid(), v_target);
END; $$;
REVOKE ALL ON FUNCTION public.invite_employee(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_employee(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_employee(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.business_members WHERE owner_id = auth.uid() AND employee_user_id = p_user_id;
END; $$;
REVOKE ALL ON FUNCTION public.remove_employee(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_employee(UUID) TO authenticated;
