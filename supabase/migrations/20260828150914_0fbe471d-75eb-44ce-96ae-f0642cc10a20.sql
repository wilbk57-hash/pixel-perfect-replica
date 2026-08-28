
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT 'Meu Negócio',
  currency TEXT NOT NULL DEFAULT 'XOF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.raw_user_meta_data->>'business_name','Meu Negócio'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'UN',
  sale_price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  current_stock NUMERIC NOT NULL DEFAULT 0,
  min_stock NUMERIC NOT NULL DEFAULT 0,
  sku TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  product_type TEXT NOT NULL DEFAULT 'FINISHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.products (user_id);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CUSTOMERS
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  current_debt NUMERIC NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customers" ON public.customers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SALES
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sale_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT 'Cliente não identificado',
  total_items NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  final_total NUMERIC NOT NULL DEFAULT 0,
  cost_total NUMERIC NOT NULL DEFAULT 0,
  gross_profit NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  change_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_debt NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sales" ON public.sales FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.sales (user_id, created_at DESC);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_unit TEXT NOT NULL DEFAULT 'UN',
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL,
  profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sale items" ON public.sale_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.sale_items (sale_id);

-- DEBTS
CREATE TABLE public.customer_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  sale_id UUID REFERENCES public.sales ON DELETE SET NULL,
  sale_number TEXT NOT NULL DEFAULT '',
  original_amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  due_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_debts TO authenticated;
GRANT ALL ON public.customer_debts TO service_role;
ALTER TABLE public.customer_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own debts" ON public.customer_debts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_debts_updated BEFORE UPDATE ON public.customer_debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  debt_id UUID REFERENCES public.customer_debts ON DELETE SET NULL,
  payment_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customer payments" ON public.customer_payments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- INVENTORY MOVEMENTS
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  previous_stock NUMERIC NOT NULL DEFAULT 0,
  new_stock NUMERIC NOT NULL DEFAULT 0,
  reference_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own movements" ON public.inventory_movements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX ON public.inventory_movements (user_id, created_at DESC);

-- RECIPES
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  yield_quantity NUMERIC NOT NULL DEFAULT 1,
  yield_unit TEXT NOT NULL DEFAULT 'UN',
  additional_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipes" ON public.recipes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_ingredients TO authenticated;
GRANT ALL ON public.recipe_ingredients TO service_role;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipe ingredients" ON public.recipe_ingredients FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.recipes ON DELETE SET NULL,
  recipe_name TEXT NOT NULL DEFAULT '',
  product_id UUID REFERENCES public.products ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  batches NUMERIC NOT NULL DEFAULT 1,
  produced_quantity NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own production" ON public.production_orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RPC: create sale
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
  v_user UUID := auth.uid();
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
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
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
REVOKE ALL ON FUNCTION public.create_sale(JSONB, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(JSONB, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

-- RPC: pay debt
CREATE OR REPLACE FUNCTION public.pay_debt(p_debt_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'CASH', p_notes TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_debt RECORD; v_pay NUMERIC; v_num TEXT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
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
REVOKE ALL ON FUNCTION public.pay_debt(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_debt(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- RPC: adjust stock
CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id UUID, p_quantity NUMERIC, p_type TEXT, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_prod RECORD; v_new NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_prod FROM products WHERE id = p_product_id AND user_id = v_user;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  v_new := v_prod.current_stock + p_quantity;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque não pode ficar negativo'; END IF;
  UPDATE products SET current_stock = v_new WHERE id = p_product_id;
  INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
  VALUES (v_user, p_product_id, v_prod.name, p_type, p_quantity, v_prod.current_stock, v_new, COALESCE(p_reason,''));
END; $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- RPC: produce
CREATE OR REPLACE FUNCTION public.produce_recipe(p_recipe_id UUID, p_batches NUMERIC DEFAULT 1, p_notes TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid(); v_recipe RECORD; v_ing RECORD; v_prod RECORD;
  v_cost NUMERIC := 0; v_qty NUMERIC; v_produced NUMERIC; v_order UUID; v_new NUMERIC;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
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
REVOKE ALL ON FUNCTION public.produce_recipe(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produce_recipe(UUID, NUMERIC, TEXT) TO authenticated;
