-- Registo de ações já processadas (idempotência da fila offline)
CREATE TABLE IF NOT EXISTS public.offline_action_log (
  client_action_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  result_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.offline_action_log TO service_role;
ALTER TABLE public.offline_action_log ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só acedida de dentro das funções SECURITY DEFINER abaixo.

-- Remover assinaturas antigas para não haver sobrecarga ambígua no PostgREST
DROP FUNCTION IF EXISTS public.create_sale(JSONB, UUID, NUMERIC, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.pay_debt(UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.adjust_stock(UUID, NUMERIC, TEXT, TEXT);

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
    RETURN;
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
    RETURN;
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