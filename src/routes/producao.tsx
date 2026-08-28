import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Factory, Trash2 } from "lucide-react";
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
import { money, qty, shortDate } from "@/lib/format";

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

type Ingredient = { product_id: string; quantity: string };

function ProductionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [outputId, setOutputId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ product_id: "", quantity: "" }]);
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

  const productName = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "—";

  const createRecipe = useMutation({
    mutationFn: async () => {
      const out = products.data?.find((p) => p.id === outputId);
      const { data, error } = await supabase
        .from("recipes")
        .insert({
          user_id: user!.id,
          name,
          output_product_id: outputId,
          output_product_name: out?.name ?? "",
          output_quantity: Number(outputQty) || 1,
        })
        .select("id")
        .single();
      if (error) throw error;
      const rows = ingredients
        .filter((i) => i.product_id && Number(i.quantity) > 0)
        .map((i) => ({
          recipe_id: data.id,
          user_id: user!.id,
          product_id: i.product_id,
          product_name: productName(i.product_id),
          quantity: Number(i.quantity),
        }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("recipe_ingredients").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Receita criada");
      setOpen(false);
      setName("");
      setOutputId("");
      setOutputQty("1");
      setIngredients([{ product_id: "", quantity: "" }]);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const produce = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("produce_recipe", {
        p_recipe_id: runId!,
        p_batches: Number(runQty) || 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produção concluída");
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
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Receita
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova receita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Produto final</Label>
                  <Select value={outputId} onValueChange={setOutputId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade produzida</Label>
                  <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ingredientes</Label>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Select
                      value={ing.product_id}
                      onValueChange={(v) =>
                        setIngredients(ingredients.map((x, i) => (i === idx ? { ...x, product_id: v } : x)))
                      }
                    >
                      <SelectTrigger className="flex-1">
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
                      className="w-24"
                      placeholder="Qtd"
                      value={ing.quantity}
                      onChange={(e) =>
                        setIngredients(
                          ingredients.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
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
                  onClick={() => setIngredients([...ingredients, { product_id: "", quantity: "" }])}
                >
                  <Plus className="size-4" /> Ingrediente
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createRecipe.mutate()} disabled={!name.trim() || !outputId}>
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
                      produz {qty(Number(r.output_quantity))} · {r.output_product_name}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setRunId(r.id)}>
                    <Factory className="size-4" /> Produzir
                  </Button>
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
            {(orders.data ?? []).map((o) => (
              <div key={o.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate">{o.recipe_name}</p>
                  <p className="text-xs text-muted-foreground">{shortDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{qty(Number(o.output_quantity))}</Badge>
                  <p className="text-xs text-muted-foreground">{money(Number(o.total_cost))}</p>
                </div>
              </div>
            ))}
            {(orders.data ?? []).length === 0 && (
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
