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

type Ingredient = { product_id: string; quantity: string; cost: string };
const EMPTY_INGREDIENT: Ingredient = { product_id: "", quantity: "", cost: "" };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function ProductionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("UN");
  const [salePrice, setSalePrice] = useState("0");
  const [outputId, setOutputId] = useState("");
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
        .select("*, recipe_ingredients(*)")
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

  const pendingRuns = usePendingQueue("produce_recipe");

  function resetForm() {
    setEditingId(null);
    setLinkMode("new");
    setName("");
    setCategoryId("");
    setUnit("UN");
    setSalePrice("0");
    setOutputId("");
    setOutputQty("1");
    setAdditionalCost("0");
    setIngredients([{ ...EMPTY_INGREDIENT }]);
  }

  function openEdit(r: any) {
    setEditingId(r.id);
    setLinkMode(r.product_id ? "existing" : "new");
    setName(r.name);
    setOutputId(r.product_id ?? "");
    const prod = (products.data ?? []).find((p) => p.id === r.product_id);
    setCategoryId(prod?.category_id ?? "");
    setUnit(r.yield_unit || prod?.unit || "UN");
    setSalePrice(String(prod?.sale_price ?? 0));
    setOutputQty(String(r.yield_quantity));
    setAdditionalCost(String(r.additional_cost ?? 0));
    setIngredients(
      (r.recipe_ingredients ?? []).length
        ? r.recipe_ingredients.map((i: any) => ({
            product_id: i.product_id,
            quantity: String(i.quantity),
            cost: String((products.data ?? []).find((p) => p.id === i.product_id)?.cost_price ?? 0),
          }))
        : [{ ...EMPTY_INGREDIENT }],
    );
    setOpen(true);
  }

  function pickIngredient(idx: number, productId: string) {
    const prod = (products.data ?? []).find((p) => p.id === productId);
    setIngredients(
      ingredients.map((x, i) =>
        i === idx ? { ...x, product_id: productId, cost: String(prod?.cost_price ?? 0) } : x,
      ),
    );
  }

  function pickExistingProduct(productId: string) {
    setOutputId(productId);
    const prod = (products.data ?? []).find((p) => p.id === productId);
    if (prod) {
      setName(prod.name);
      setCategoryId(prod.category_id ?? "");
      setUnit(prod.unit || "UN");
      setSalePrice(String(prod.sale_price ?? 0));
    }
  }

  const ingredientsCost = ingredients.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.cost) || 0),
    0,
  );
  const totalCost = ingredientsCost + (Number(additionalCost) || 0);
  const unitCost = Number(outputQty) > 0 ? totalCost / Number(outputQty) : 0;

  const saveRecipe = useMutation({
    mutationFn: async () => {
      const valid = ingredients.filter((i) => i.product_id && Number(i.quantity) > 0);
      for (const i of valid) {
        const prod = (products.data ?? []).find((p) => p.id === i.product_id);
        const newCost = Number(i.cost) || 0;
        if (prod && Number(prod.cost_price) !== newCost) {
          const { error } = await supabase
            .from("products")
            .update({ cost_price: newCost })
            .eq("id", i.product_id);
          if (error) throw error;
        }
      }
      const rows = valid.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
      const { error } = await supabase.rpc("save_recipe", {
        p_recipe_id: editingId as unknown as string,
        p_name: name,
        p_product_id: (linkMode === "existing" && outputId ? outputId : null) as unknown as string,
        p_category_id: (categoryId || null) as unknown as string,
        p_unit: unit,
        p_sale_price: Number(salePrice) || 0,
        p_yield_quantity: Number(outputQty) || 1,
        p_additional_cost: Number(additionalCost) || 0,
        p_ingredients: rows,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "Receita atualizada" : "Receita criada");
      setOpen(false);
      resetForm();
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
              <DialogTitle>{editingId ? "Editar receita" : "Nova receita"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={linkMode === "new" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLinkMode("new")}
                >
                  Criar novo produto
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={linkMode === "existing" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLinkMode("existing")}
                >
                  Ligar a produto existente
                </Button>
              </div>

              {linkMode === "existing" && (
                <div className="space-y-2">
                  <Label>Produto existente</Label>
                  <select
                    value={outputId}
                    onChange={(e) => pickExistingProduct(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Escolher produto</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do produto</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Sem categoria</option>
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={selectClass}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Preço de venda</Label>
                  <Input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantidade produzida</Label>
                  <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Custo adicional</Label>
                  <Input type="number" value={additionalCost} onChange={(e) => setAdditionalCost(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ingredientes</Label>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex gap-2">
                      <select
                        value={ing.product_id}
                        onChange={(e) => pickIngredient(idx, e.target.value)}
                        className={`${selectClass} flex-1`}
                      >
                        <option value="">Matéria-prima</option>
                        {(products.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
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
                        value={ing.cost}
                        onChange={(e) =>
                          setIngredients(
                            ingredients.map((x, i) => (i === idx ? { ...x, cost: e.target.value } : x)),
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
                    <p className="text-right text-xs text-muted-foreground">
                      Subtotal: {money((Number(ing.quantity) || 0) * (Number(ing.cost) || 0))}
                    </p>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIngredients([...ingredients, { ...EMPTY_INGREDIENT }])}
                >
                  <Plus className="size-4" /> Ingrediente
                </Button>
              </div>

              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo dos ingredientes</span>
                  <span>{money(ingredientsCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo adicional</span>
                  <span>{money(Number(additionalCost) || 0)}</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Custo total de produção</span>
                  <span>{money(totalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantidade produzida</span>
                  <span>
                    {qty(Number(outputQty) || 0)} {unit}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-1">
                  <span className="font-medium">Custo por unidade</span>
                  <span className="text-lg font-bold">{money(unitCost)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => saveRecipe.mutate()} disabled={!name.trim() || (linkMode === "existing" && !outputId) || saveRecipe.isPending}>
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
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      produz {qty(Number(r.yield_quantity))} {r.yield_unit} · {r.product_name}
                    </p>
                    <Badge variant="secondary" className="mt-1">
                      Custo/un: {money(Number(r.estimated_unit_cost ?? 0))}
                    </Badge>
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
                      <span>{qty(Number(i.quantity))}</span>
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
            {pendingRuns.map((r) => {
              const recipe = list.find((x) => x.id === r.payload.p_recipe_id);
              return (
                <div key={r.localId} className="flex items-start justify-between text-sm opacity-70">
                  <div className="min-w-0">
                    <p className="truncate">{recipe?.name ?? "Receita"}</p>
                    <p className="text-xs text-muted-foreground">Por sincronizar</p>
                  </div>
                  <Badge variant="outline">{r.payload.p_batches}x</Badge>
                </div>
              );
            })}
            {(orders.data ?? []).map((o) => (
              <div key={o.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate">{o.recipe_name}</p>
                  <p className="text-xs text-muted-foreground">{shortDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{qty(Number(o.produced_quantity))}</Badge>
                  <p className="text-xs text-muted-foreground">{money(Number(o.total_cost))}</p>
                </div>
              </div>
            ))}
            {pendingRuns.length === 0 && (orders.data ?? []).length === 0 && (
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
