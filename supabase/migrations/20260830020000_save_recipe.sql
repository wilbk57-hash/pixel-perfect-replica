CREATE OR REPLACE FUNCTION public.save_recipe(
  p_recipe_id UUID,
  p_name TEXT,
  p_product_id UUID,
  p_yield_quantity NUMERIC,
  p_additional_cost NUMERIC,
  p_ingredients JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID;
  v_recipe_id UUID;
  v_product_name TEXT;
  v_yield_unit TEXT;
  v_ing JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.effective_owner_id();

  v_product_name := '';
  v_yield_unit := 'UN';
  IF p_product_id IS NOT NULL THEN
    SELECT name, unit INTO v_product_name, v_yield_unit FROM products WHERE id = p_product_id AND user_id = v_user;
    IF v_product_name IS NULL THEN RAISE EXCEPTION 'Produto final inválido'; END IF;
  END IF;

  IF p_recipe_id IS NOT NULL THEN
    UPDATE recipes SET
      name = p_name,
      product_id = p_product_id,
      product_name = COALESCE(v_product_name, ''),
      yield_quantity = p_yield_quantity,
      yield_unit = COALESCE(v_yield_unit, 'UN'),
      additional_cost = p_additional_cost
    WHERE id = p_recipe_id AND user_id = v_user
    RETURNING id INTO v_recipe_id;

    IF v_recipe_id IS NULL THEN RAISE EXCEPTION 'Receita não encontrada'; END IF;

    DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id AND user_id = v_user;
  ELSE
    INSERT INTO recipes (user_id, name, product_id, product_name, yield_quantity, yield_unit, additional_cost)
    VALUES (v_user, p_name, p_product_id, COALESCE(v_product_name, ''), p_yield_quantity, COALESCE(v_yield_unit, 'UN'), p_additional_cost)
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

REVOKE ALL ON FUNCTION public.save_recipe(UUID, TEXT, UUID, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(UUID, TEXT, UUID, NUMERIC, NUMERIC, JSONB) TO authenticated;
