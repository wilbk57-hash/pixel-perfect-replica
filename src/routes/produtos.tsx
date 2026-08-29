import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, qty, UNITS, PRODUCT_TYPES } from "@/lib/format";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos e categorias — BK BUSINESS" },
      { name: "description", content: "Catálogo de produtos, matérias-primas, preços e categorias do negócio." },
      { property: "og:title", content: "Produtos — BK BUSINESS" },
      { property: "og:description", content: "Catálogo de produtos, preços e categorias." },
    ],
  }),
  component: ProductsPage,
});

type Draft = {
  id?: string;
  name: string;
  category_id: string | null;
  description: string;
  unit: string;
  product_type: string;
  sale_price: string;
  cost_price: string;
  current_stock: string;
  min_stock: string;
  sku: string;
};

const EMPTY: Draft = {
  name: "",
  category_id: null,
  description: "",
  unit: "UN",
  product_type: "FINISHED",
  sale_price: "0",
  cost_price: "0",
  current_stock: "0",
  min_stock: "0",
  sku: "",
};

function ProductsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");

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

  const saveProduct = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        user_id: user!.id,
        name: d.name,
        category_id: d.category_id,
        description: d.description,
        unit: d.unit,
        product_type: d.product_type,
        sale_price: Number(d.sale_price) || 0,
        cost_price: Number(d.cost_price) || 0,
        min_stock: Number(d.min_stock) || 0,
        sku: d.sku,
      };
      if (d.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({ ...payload, current_stock: Number(d.current_stock) || 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produto guardado");
      setOpen(false);
      setDraft(EMPTY);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCategory = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("categories").insert({ user_id: user!.id, name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria criada");
      setCatName("");
      setCatOpen(false);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (products.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const catName_ = (id: string | null) => categories.data?.find((c) => c.id === id)?.name ?? "Sem categoria";

  return (
        <AppShell
      title="Produtos"
      subtitle="Catálogo, preços e matérias-primas"
      adminOnly
      actions={
        <div className="flex gap-2">
          <Dialog open={catOpen} onOpenChange={setCatOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Tag className="size-4" /> Categoria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button onClick={() => saveCategory.mutate(catName)} disabled={!catName.trim()}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setDraft(EMPTY);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{draft.id ? "Editar produto" : "Novo produto"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nome</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={draft.category_id ?? "none"}
                    onValueChange={(v) => setDraft({ ...draft, category_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={draft.product_type} onValueChange={(v) => setDraft({ ...draft, product_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v })}>
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
                <div className="space-y-2">
                  <Label>Código / SKU</Label>
                  <Input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Preço de venda</Label>
                  <Input
                    type="number"
                    value={draft.sale_price}
                    onChange={(e) => setDraft({ ...draft, sale_price: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço de custo</Label>
                  <Input
                    type="number"
                    value={draft.cost_price}
                    onChange={(e) => setDraft({ ...draft, cost_price: e.target.value })}
                  />
                </div>
                {!draft.id && (
                  <div className="space-y-2">
                    <Label>Estoque inicial</Label>
                    <Input
                      type="number"
                      value={draft.current_stock}
                      onChange={(e) => setDraft({ ...draft, current_stock: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Estoque mínimo</Label>
                  <Input
                    type="number"
                    value={draft.min_stock}
                    onChange={(e) => setDraft({ ...draft, min_stock: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => saveProduct.mutate(draft)} disabled={!draft.name.trim()}>
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Input
        placeholder="Pesquisar produto…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Card key={p.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{catName_(p.category_id)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setDraft({
                      id: p.id,
                      name: p.name,
                      category_id: p.category_id,
                      description: p.description,
                      unit: p.unit,
                      product_type: p.product_type,
                      sale_price: String(p.sale_price),
                      cost_price: String(p.cost_price),
                      current_stock: String(p.current_stock),
                      min_stock: String(p.min_stock),
                      sku: p.sku,
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-lg font-bold">{money(Number(p.sale_price))}</p>
                  <p className="text-xs text-muted-foreground">custo {money(Number(p.cost_price))}</p>
                </div>
                <Badge variant={Number(p.current_stock) <= Number(p.min_stock) ? "destructive" : "secondary"}>
                  {qty(Number(p.current_stock))} {p.unit}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        )}
      </div>
    </AppShell>
  );
}
