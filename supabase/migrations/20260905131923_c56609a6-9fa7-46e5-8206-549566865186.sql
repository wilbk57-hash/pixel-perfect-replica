CREATE OR REPLACE FUNCTION public.produce_recipe(p_recipe_id uuid, p_batches numeric DEFAULT 1, p_notes text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := public.business_id(auth.uid()); v_recipe RECORD; v_ing RECORD; v_prod RECORD;
  v_cost NUMERIC := 0; v_qty NUMERIC; v_produced NUMERIC; v_order UUID; v_new NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_batches <= 0 THEN RAISE EXCEPTION 'Número de lotes inválido'; END IF;
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;

  FOR v_ing IN SELECT * FROM recipe_ingredients WHERE recipe_id = p_recipe_id AND user_id = v_user LOOP
    SELECT * INTO v_prod FROM products WHERE id = v_ing.product_id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente inválido'; END IF;
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
    IF FOUND THEN
      v_new := v_prod.current_stock + v_produced;
      UPDATE products SET current_stock = v_new,
        cost_price = CASE WHEN v_produced > 0 THEN v_cost / v_produced ELSE cost_price END WHERE id = v_prod.id;
      INSERT INTO inventory_movements (user_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason)
      VALUES (v_user, v_prod.id, v_prod.name, 'PRODUCTION', v_produced, v_prod.current_stock, v_new, 'Produção: ' || v_recipe.name);
    END IF;
  END IF;

  RETURN v_order;
END; $function$;