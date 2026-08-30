ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS estimated_unit_cost numeric NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.save_recipe(uuid, text, uuid, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.save_recipe(
  p_recipe_id UUID,
  p_name TEXT,
  p_product_id UUID,
  p_category_id UUID,
  p_unit TEXT,
  p_sale_price NUMERIC,
  p_yield_quantity NUMERIC,
  p_additional_cost NUMERIC,
  p_ingredients JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
  v_recipe_id UUID;
  v_product_id UUID;
  v_ing JSONB;
  v_ing_cost NUMERIC := 0;
  v_ing_qty NUMERIC;
  v_prod_cost NUMERIC;
  v_total_cost NUMERIC;
  v_unit_cost NUMERIC;
  v_unit TEXT := COALESCE(NULLIF(p_unit,''), 'UN');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.business_id(auth.uid());

  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome do produto é obrigatório'; END IF;
  IF p_yield_quantity IS NULL OR p_yield_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade produzida inválida'; END IF;

  IF p_ingredients IS NOT NULL THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients) LOOP
      SELECT cost_price INTO v_prod_cost FROM products WHERE id = (v_ing->>'product_id')::uuid AND user_id = v_user;
      IF v_prod_cost IS NULL THEN RAISE EXCEPTION 'Ingrediente inválido'; END IF;
      v_ing_qty := (v_ing->>'quantity')::numeric;
      v_ing_cost := v_ing_cost + v_prod_cost * v_ing_qty;
    END LOOP;
  END IF;
  v_total_cost := v_ing_cost + COALESCE(p_additional_cost, 0);
  v_unit_cost := CASE WHEN p_yield_quantity > 0 THEN v_total_cost / p_yield_quantity ELSE 0 END;

  IF p_product_id IS NULL THEN
    INSERT INTO products (user_id, category_id, name, unit, product_type, sale_price, cost_price, current_stock, min_stock)
    VALUES (v_user, p_category_id, btrim(p_name), v_unit, 'FINISHED', COALESCE(p_sale_price, 0), v_unit_cost, 0, 0)
    RETURNING id INTO v_product_id;
  ELSE
    SELECT id INTO v_product_id FROM products WHERE id = p_product_id AND user_id = v_user;
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'Produto inválido'; END IF;
    UPDATE products SET
      name = btrim(p_name),
      category_id = p_category_id,
      unit = v_unit,
      sale_price = COALESCE(p_sale_price, sale_price),
      cost_price = v_unit_cost
    WHERE id = v_product_id;
  END IF;

  IF p_recipe_id IS NOT NULL THEN
    UPDATE recipes SET
      name = p_name,
      product_id = v_product_id,
      product_name = btrim(p_name),
      yield_quantity = p_yield_quantity,
      yield_unit = v_unit,
      additional_cost = COALESCE(p_additional_cost, 0),
      estimated_unit_cost = v_unit_cost
    WHERE id = p_recipe_id AND user_id = v_user
    RETURNING id INTO v_recipe_id;
    IF v_recipe_id IS NULL THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;
    DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id AND user_id = v_user;
  ELSE
    INSERT INTO recipes (user_id, name, product_id, product_name, yield_quantity, yield_unit, additional_cost, estimated_unit_cost)
    VALUES (v_user, p_name, v_product_id, btrim(p_name), p_yield_quantity, v_unit, COALESCE(p_additional_cost,0), v_unit_cost)
    RETURNING id INTO v_recipe_id;
  END IF;

  IF p_ingredients IS NOT NULL THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients) LOOP
      INSERT INTO recipe_ingredients (user_id, recipe_id, product_id, product_name, quantity, unit)
      SELECT v_user, v_recipe_id, p.id, p.name, (v_ing->>'quantity')::numeric, p.unit
      FROM products p
      WHERE p.id = (v_ing->>'product_id')::uuid AND p.user_id = v_user;
    END LOOP;
  END IF;

  RETURN v_recipe_id;
END; $$;

REVOKE ALL ON FUNCTION public.save_recipe(UUID, TEXT, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(UUID, TEXT, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB) TO authenticated;