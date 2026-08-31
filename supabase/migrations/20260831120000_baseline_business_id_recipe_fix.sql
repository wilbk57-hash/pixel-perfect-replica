-- ============================================================================
-- MIGRAÇÃO DE BASELINE — captura objetos que já existiam AO VIVO na base de
-- dados (aplicados manualmente/via agente fora do histórico de migrações)
-- mas que nunca tinham sido gravados em nenhum ficheiro versionado.
--
-- Esta migração é IDEMPOTENTE: pode ser aplicada com segurança mesmo que os
-- objetos já existam (usa CREATE OR REPLACE / IF NOT EXISTS / DROP...IF
-- EXISTS + CREATE em todo o lado). O objetivo é apenas colocar o repositório
-- Git em paridade com o que está realmente em produção, e corrigir a função
-- save_recipe (que estava com uma assinatura desatualizada e a bloquear o
-- ecrã de Produção).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela assistant_messages (existia ao vivo, nunca tinha migração)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Coluna user_roles.owner_id (existia ao vivo, nunca tinha migração)
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Funções centrais de multi-negócio (existiam ao vivo, nunca tinham migração)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT owner_id FROM public.user_roles WHERE user_id = _user_id AND role = 'funcionario' LIMIT 1),
    _user_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.my_business_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select owner_id from public.user_roles where user_id = auth.uid() and role = 'funcionario' limit 1),
      auth.uid()
    )
  end
$function$;

CREATE OR REPLACE FUNCTION public.set_business_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.user_id := public.business_id(auth.uid());
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_product(p_product_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.business_id(auth.uid());
  v_has_refs boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND user_id = v_user) THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM sale_items WHERE product_id = p_product_id
    UNION ALL SELECT 1 FROM recipe_ingredients WHERE product_id = p_product_id
    UNION ALL SELECT 1 FROM recipes WHERE product_id = p_product_id
    UNION ALL SELECT 1 FROM inventory_movements WHERE product_id = p_product_id
    UNION ALL SELECT 1 FROM production_orders WHERE product_id = p_product_id
  ) INTO v_has_refs;

  IF v_has_refs THEN
    UPDATE products SET status = 'INACTIVE' WHERE id = p_product_id AND user_id = v_user;
    RETURN 'archived';
  ELSE
    DELETE FROM products WHERE id = p_product_id AND user_id = v_user;
    RETURN 'deleted';
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.delete_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Triggers trg_set_business_id (existiam ao vivo, nunca tinham migração)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'assistant_messages','categories','customer_debts','customer_payments',
    'customers','debt_reminders','inventory_movements','production_orders',
    'products','recipe_ingredients','recipes','sale_items','sales'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_business_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_business_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_business_id()',
      t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Políticas RLS "shared business X" (existiam ao vivo, nunca tinham migração)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'assistant_messages','categories','customer_debts','customer_payments',
    'customers','debt_reminders','inventory_movements','production_orders',
    'products','recipe_ingredients','recipes','sale_items','sales'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "shared business %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "shared business %s" ON public.%I FOR ALL USING (user_id = public.business_id(auth.uid())) WITH CHECK (user_id = public.business_id(auth.uid()))',
      t, t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- NOTA (não aplicado automaticamente — decisão a confirmar com o dono do
-- projeto): as tabelas customer_debts, debt_reminders, inventory_movements
-- e production_orders ainda têm, em paralelo, políticas antigas "own X"
-- (user_id = auth.uid()) de uma versão anterior de single-tenant, que ficaram
-- por remover quando o modelo multi-negócio foi introduzido. Não impedem nada
-- hoje (apenas alargam o acesso a linhas antigas do próprio utilizador), mas
-- são resíduo e vale a pena limpar:
--
--   DROP POLICY IF EXISTS "own debts" ON public.customer_debts;
--   DROP POLICY IF EXISTS "own reminders" ON public.debt_reminders;
--   DROP POLICY IF EXISTS "own movements" ON public.inventory_movements;
--   DROP POLICY IF EXISTS "own production" ON public.production_orders;
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6. Correção de save_recipe — a versão anterior (9 parâmetros) já não
--    correspondia ao que o frontend (src/routes/producao.tsx) envia, o que
--    fazia a gravação de receitas/produção falhar. Substituída por uma
--    versão de 10 parâmetros com p_product_name.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_recipe(uuid, text, uuid, uuid, text, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.save_recipe(
  p_recipe_id uuid,
  p_name text,
  p_product_id uuid,
  p_product_name text,
  p_category_id uuid,
  p_unit text,
  p_sale_price numeric,
  p_yield_quantity numeric,
  p_additional_cost numeric,
  p_ingredients jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_final_name TEXT := COALESCE(NULLIF(btrim(p_product_name), ''), NULLIF(btrim(p_name), ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_user := public.business_id(auth.uid());

  IF v_final_name IS NULL THEN RAISE EXCEPTION 'Nome do produto é obrigatório'; END IF;
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
    VALUES (v_user, p_category_id, v_final_name, v_unit, 'FINISHED', COALESCE(p_sale_price, 0), v_unit_cost, 0, 0)
    RETURNING id INTO v_product_id;
  ELSE
    SELECT id INTO v_product_id FROM products WHERE id = p_product_id AND user_id = v_user;
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'Produto inválido'; END IF;
    UPDATE products SET
      name = v_final_name,
      category_id = p_category_id,
      unit = v_unit,
      sale_price = COALESCE(p_sale_price, sale_price),
      cost_price = v_unit_cost
    WHERE id = v_product_id;
  END IF;

  IF p_recipe_id IS NOT NULL THEN
    UPDATE recipes SET
      name = v_final_name,
      product_id = v_product_id,
      product_name = v_final_name,
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
    VALUES (v_user, v_final_name, v_product_id, v_final_name, p_yield_quantity, v_unit, COALESCE(p_additional_cost,0), v_unit_cost)
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
END;
$function$;

REVOKE ALL ON FUNCTION public.save_recipe(uuid, text, uuid, text, uuid, text, numeric, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recipe(uuid, text, uuid, text, uuid, text, numeric, numeric, numeric, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- NOTA IMPORTANTE: esta migração já foi aplicada diretamente na base de
-- dados ao vivo (projeto Supabase lcmfpvnahmzhekaobsqw) em 2026-08-31, para
-- desbloquear a Produção imediatamente. Aplicar este ficheiro de novo é
-- seguro (é idempotente) — serve para o histórico do repositório Git ficar
-- coerente com a realidade. Basta:
--   1. Apagar do repositório o ficheiro sem extensão
--      "supabase/migrations/20260831000000 recipe creates product"
--      (nunca foi de facto executado pelas ferramentas do Supabase CLI).
--   2. Adicionar este ficheiro como
--      supabase/migrations/20260831120000_baseline_business_id_recipe_fix.sql
--   3. Fazer commit.
-- ============================================================================
