CREATE OR REPLACE FUNCTION public.pay_debt(p_debt_id uuid, p_amount numeric, p_method text DEFAULT 'CASH'::text, p_notes text DEFAULT ''::text, p_client_action_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user UUID; v_debt RECORD; v_pay NUMERIC; v_num TEXT; v_remaining NUMERIC; v_sale_num TEXT;
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
  ELSE
    v_sale_num := 'DIV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(((SELECT count(*) FROM sales WHERE user_id = v_user AND created_at::date = current_date) + 1)::text, 4, '0');
    INSERT INTO sales (user_id, sale_number, customer_id, customer_name, total_items, subtotal,
      discount_amount, final_total, cost_total, gross_profit, paid_amount, change_amount,
      remaining_debt, payment_method, payment_status, status, notes)
    VALUES (v_user, v_sale_num, v_debt.customer_id, v_debt.customer_name, 0, v_pay,
      0, v_pay, 0, v_pay, v_pay, 0,
      0, p_method, 'PAID', 'COMPLETED', 'Pagamento de dívida ' || COALESCE(NULLIF(p_notes,''), ''));
  END IF;

  INSERT INTO customer_payments (user_id, customer_id, customer_name, debt_id, payment_number, amount, payment_method, notes)
  VALUES (v_user, v_debt.customer_id, v_debt.customer_name, p_debt_id, v_num, v_pay, p_method, COALESCE(p_notes,''));

  IF p_client_action_id IS NOT NULL THEN
    INSERT INTO public.offline_action_log (client_action_id, user_id, action_type)
    VALUES (p_client_action_id, v_user, 'pay_debt')
    ON CONFLICT (client_action_id) DO NOTHING;
  END IF;
END;
$function$;