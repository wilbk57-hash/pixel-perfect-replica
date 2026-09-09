CREATE OR REPLACE FUNCTION public.pay_debt(p_debt_id uuid, p_amount numeric, p_method text DEFAULT 'CASH', p_notes text DEFAULT '', p_client_action_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user UUID; v_debt RECORD; v_pay NUMERIC; v_num TEXT; v_remaining NUMERIC;
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
  v_remaining := v_debt.remaining_amount - v_pay;
  v_num := 'REC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM customer_payments WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');

  UPDATE customer_debts SET paid_amount = paid_amount + v_pay, remaining_amount = v_remaining,
    status = CASE WHEN v_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END, updated_at = now()
  WHERE id = p_debt_id;

  UPDATE customers SET current_debt = GREATEST(current_debt - v_pay, 0), updated_at = now() WHERE id = v_debt.customer_id;

  IF v_debt.sale_id IS NOT NULL THEN
    UPDATE sales SET
      paid_amount = paid_amount + v_pay,
      remaining_debt = GREATEST(remaining_debt - v_pay, 0),
      payment_status = CASE WHEN GREATEST(remaining_debt - v_pay, 0) <= 0 THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = v_debt.sale_id AND user_id = v_user;
  END IF;

  INSERT INTO customer_payments (user_id, customer_id, customer_name, debt_id, payment_number, amount, payment_method, notes)
  VALUES (v_user, v_debt.customer_id, v_debt.customer_name, p_debt_id, v_num, v_pay, p_method, COALESCE(p_notes,''));

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type)
    VALUES (p_client_action_id, v_user, 'pay_debt')
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_debt(p_customer_id uuid, p_amount numeric, p_due_date date DEFAULT NULL, p_notes text DEFAULT '', p_client_action_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user UUID; v_customer RECORD; v_id UUID; v_num TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_client_action_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.offline_action_log WHERE client_action_id = p_client_action_id
  ) THEN
    RETURN NULL;
  END IF;

  v_user := public.business_id(auth.uid());
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id AND user_id = v_user;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

  v_num := 'DIV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM customer_debts WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');

  INSERT INTO customer_debts (user_id, customer_id, customer_name, sale_number, original_amount, paid_amount, remaining_amount, status, due_date, notes)
  VALUES (v_user, p_customer_id, v_customer.name, v_num, p_amount, 0, p_amount, 'PENDING', p_due_date, COALESCE(p_notes,''))
  RETURNING id INTO v_id;

  UPDATE customers SET current_debt = current_debt + p_amount, updated_at = now() WHERE id = p_customer_id;

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type, result_id)
    VALUES (p_client_action_id, v_user, 'create_debt', v_id)
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_debt(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_debt(uuid, numeric, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_debt(uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_debt(uuid, numeric, date, text, uuid) TO authenticated;