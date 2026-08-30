import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Factory, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, qty, shortDate, UNITS } from "@/lib/format";
import { runOrQueue, usePendingQueue, type ProduceRecipePayload } from "@/lib/offline-queue";

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Produção e receitas — BK BUSINESS" },
      { name: "description", content: "Receitas de produção, consumo de matérias-primas e ordens de fabrico." },
      { property: "og:title", content: "Produção — BK BUSINESS" },
      { property: "og:description", content: "Receitas e ordens de produção." },
    ],
  }),
  component: ProductionPage,
});

type Ingredient = { product_id: string; quantity: string; unit_cost: string };
const EMPTY_INGREDIENT: Ingredient = { product_id: "", quantity: "", unit_cost: "" };

function ProductionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dados do produto final (a receita CRIA/ATUALIZA este produto diretamente)
  const [productId, setProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [unit, setUnit] = useState("UN");
  const [salePrice, setSalePrice] = useState("0");

  const [outputQty, setOutputQty] = useState("1");
  const [additionalCost, setAdditionalCost] = useState("0");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...EMPTY_INGREDIENT }]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runQty, setRunQty] = useState("1");

  const products = useQuery({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const categories = useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const recipes = useQuery({
    queryKey: ["recipes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*, recipe_ingredients(*), product:products(id, name, category_id, unit, sale_price, cost_price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const orders = useQuery({
    queryKey: ["production-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  function resetForm() {
    setEditingId(null);
    setProductId(null);
    setProductName("");
    setCategoryId(null);
    setUnit("UN");
    setSalePrice("0");
    setOutputQty("1");
    setAdditionalCost("0");
    setIngredients([{ ...EMPTY_INGREDIENT }]);
  }

  function openEdit(r: any) {
    setEditingId(r.id);
    setProductId(r.product_id ?? null);
    setProductName(r.product?.name ?? r.product_name ?? "");
    setCategoryId(r.product?.category_id ?? null);
    setUnit(r.product?.unit ?? r.yield_unit ?? "UN");
    setSalePrice(String(r.product?.sale_price ?? 0));
    setOutputQty(String(r.yield_quantity));
    setAdditionalCost(String(r.additional_cost ?? 0));
    setIngredients(
      (r.recipe_ingredients ?? []).length
        ? r.recipe_ingredients.map((i: any) => ({
            product_id: i.product_id,
            quantity: String(i.quantity),
            unit_cost: String(i.unit_cost ?? 0),
          }))
        : [{ ...EMPTY_INGREDIENT }],
    );
    setOpen(true);
  }

  // Custo ao vivo: soma (quantidade x custo unitário editável) + custo adicional, dividido pela quantidade produzida
  const ingredientsCost = ingredients.reduce(
    (a, i) => a + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0),
    0,
  );
  const totalCost = ingredientsCost + (Number(additionalCost) || 0);
  const unitCost = Number(outputQty) > 0 ? totalCost / Number(outputQty) : 0;

  const saveRecipe = useMutation({
    mutationFn: async () => {
      const rows = ingredients
        .filter((i) => i.product_id && Number(i.quantity) > 0)
        .map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost) || 0,
        }));
      const { error } = await supabase.rpc("save_recipe", {
        p_recipe_id: editingId,
        p_name: productName.trim(),
        p_product_id: productId,
        p_product_name: productName.trim(),
        p_category_id: categoryId,
        p_unit: unit,
        p_sale_price: Number(salePrice) || 0,
        p_yield_quantity: Number(outputQty) || 1,
        p_additional_cost: Number(additionalCost) || 0,
        p_ingredients: rows,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "Produto e receita atualizados" : "Produto criado e receita guardada");
      setOpen(false);
      resetForm();
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingProductions = usePendingQueue("produce_recipe");

  const produce = useMutation({
    mutationFn: async () => {
      const payload: ProduceRecipePayload = { p_recipe_id: runId!, p_batches: Number(runQty) || 1 };
      return runOrQueue("produce_recipe", payload, "Produção", async () => {
        const { error } = await supabase.rpc("produce_recipe", payload as any);
        if (error) throw error;
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.offline
          ? "Sem ligação — produção guardada neste aparelho. Toque em \"Sincronizar\" quando voltar online."
          : "Produção concluída",
      );
      setRunId(null);
      setRunQty("1");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = recipes.data ?? [];

  return (
    <AppShell
      title="Produção"
      subtitle={`${list.length} receita(s)`}
      adminOnly
      actions={
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="size-4" /> Receita
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar produto / receita" : "Novo produto por receita"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do produto</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex: Sumo de manga 1L"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={categoryId ?? "none"} onValueChange={(v) => setCategoryId(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {(categories.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Unidade do produto</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Preço de venda</Label>
                  <Input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Quantidade produzida (rendimento)</Label>
                  <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custo adicional (mão de obra, energia, etc.)</Label>
                <Input type="number" value={additionalCost} onChange={(e) => setAdditionalCost(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Ingredientes</Label>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <Select
                      value={ing.product_id}
                      onValueChange={(v) => {
                        const prod = (products.data ?? []).find((p) => p.id === v);
                        setIngredients(
                          ingredients.map((x, i) =>
                            i === idx
                              ? { ...x, product_id: v, unit_cost: x.unit_cost || String(prod?.cost_price ?? 0) }
                              : x,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger className="min-w-[10rem] flex-1">
                        <SelectValue placeholder="Matéria-prima" />
                      </SelectTrigger>
                      <SelectContent>
                        {(products.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="Qtd"
                      value={ing.quantity}
                      onChange={(e) =>
                        setIngredients(
                          ingredients.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      className="w-24"
                      placeholder="Custo un."
                      value={ing.unit_cost}
                      onChange={(e) =>
                        setIngredients(
                          ingredients.map((x, i) => (i === idx ? { ...x, unit_cost: e.target.value } : x)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIngredients([...ingredients, { ...EMPTY_INGREDIENT }])}
                >
                  <Plus className="size-4" /> Ingrediente
                </Button>
                <p className="text-xs text-muted-foreground">
                  O custo unitário vem preenchido automaticamente com o custo atual do produto escolhido, mas pode
                  ser editado — por exemplo se comprou esse lote mais caro ou mais barato.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo total da produção</span>
                  <span className="font-medium">{money(totalCost)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Custo por unidade</span>
                  <span className="font-semibold">{money(unitCost)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => saveRecipe.mutate()}
                disabled={!productName.trim() || saveRecipe.isPending}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-3 md:grid-cols-2 lg:col-span-2">
          {list.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.product?.name ?? r.product_name ?? r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      produz {qty(Number(r.yield_quantity))} {r.yield_unit} · custo un.{" "}
                      {money(Number(r.product?.cost_price ?? 0))}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" onClick={() => setRunId(r.id)}>
                      <Factory className="size-4" /> Produzir
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {(r.recipe_ingredients ?? []).map((i) => (
                    <div key={i.id} className="flex justify-between text-muted-foreground">
                      <span className="truncate">{i.product_name}</span>
                      <span>
                        {qty(Number(i.quantity))} · {money(Number(i.unit_cost ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma receita criada.</p>}
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">Produções recentes</p>
            {pendingProductions.map((o) => {
              const recipe = list.find((r) => r.id === o.payload.p_recipe_id);
              return (
                <div key={o.localId} className="flex items-start justify-between text-sm opacity-70">
                  <div className="min-w-0">
                    <p className="truncate">{recipe?.product?.name ?? recipe?.product_name ?? "Produto"}</p>
                    <p className="text-xs text-muted-foreground">Por sincronizar</p>
                  </div>
                  <Badge variant="outline">{o.payload.p_batches}x lote(s)</Badge>
                </div>
              );
            })}
            {(orders.data ?? []).map((o) => (
              <div key={o.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate">{o.product_name || o.recipe_name}</p>
                  <p className="text-xs text-muted-foreground">{shortDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{qty(Number(o.produced_quantity))}</Badge>
                  <p className="text-xs text-muted-foreground">{money(Number(o.total_cost))}</p>
                </div>
              </div>
            ))}
            {pendingProductions.length === 0 && (orders.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem produções.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!runId} onOpenChange={(v) => !v && setRunId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Executar produção</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Número de lotes</Label>
            <Input type="number" value={runQty} onChange={(e) => setRunQty(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={() => produce.mutate()} disabled={produce.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
