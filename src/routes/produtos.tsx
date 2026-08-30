import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Tag, Sparkles, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { generateProductImage } from "@/lib/image.functions";
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [imageTarget, setImageTarget] = useState<{ id: string; name: string; description: string } | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [packaging, setPackaging] = useState("auto");
  const generateImage = useServerFn(generateProductImage);

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

  const generateProductPhoto = useMutation({
    mutationFn: async (p: {
      id: string;
      name: string;
      description: string;
      customInstructions: string;
      packaging: string;
    }) => {
      setGeneratingId(p.id);
      return await generateImage({
        data: {
          productId: p.id,
          name: p.name,
          description: p.description,
          customInstructions: p.customInstructions,
          packaging: p.packaging,
        },
      });
    },
    onSettled: () => setGeneratingId(null),
    onSuccess: () => {
      toast.success("Imagem gerada com sucesso");
      setImageTarget(null);
      setCustomInstructions("");
      setPackaging("auto");
      qc.invalidateQueries({ queryKey: ["products"] });
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
          <Card key={p.id} className="overflow-hidden">
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-8" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
                <p className="truncate text-sm font-semibold text-white drop-shadow-sm">{p.name}</p>
                <p className="truncate text-xs text-white/80">{catName_(p.category_id)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="absolute right-2 top-2 shadow"
                disabled={generatingId === p.id}
                onClick={() => {
                  setImageTarget({ id: p.id, name: p.name, description: p.description ?? "" });
                  setCustomInstructions("");
                  setPackaging("auto");
                }}
              >
                <Sparkles className="size-4" />
                {generatingId === p.id
                  ? "A gerar…"
                  : p.image_url
                    ? "Regenerar imagem"
                    : "Gerar imagem IA"}
              </Button>
            </div>
            <CardContent className="pt-4">
              <div className="flex items-start justify-end gap-2">
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
              <div className="mt-2 flex items-end justify-between">
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

      <Dialog
        open={!!imageTarget}
        onOpenChange={(v) => {
          if (!v) {
            setImageTarget(null);
            setCustomInstructions("");
            setPackaging("auto");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar imagem de {imageTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Formato da embalagem</Label>
              <Select value={packaging} onValueChange={setPackaging}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (a IA escolhe)</SelectItem>
                  <SelectItem value="glass_bottle">Garrafa de vidro</SelectItem>
                  <SelectItem value="plastic_bottle">Garrafa de plástico</SelectItem>
                  <SelectItem value="can">Lata</SelectItem>
                  <SelectItem value="jar">Frasco / jarra</SelectItem>
                  <SelectItem value="box">Caixa / embalagem</SelectItem>
                  <SelectItem value="none">Sem embalagem (só o ingrediente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Instruções extra (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Descreva mais detalhes — por exemplo "numa mesa de madeira rústica", "fundo azul", "sem
                tampa". Se deixar em branco, a IA completa o resto automaticamente.
              </p>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Ex: fundo de madeira escura, luz quente…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                imageTarget &&
                generateProductPhoto.mutate({
                  id: imageTarget.id,
                  name: imageTarget.name,
                  description: imageTarget.description,
                  customInstructions,
                  packaging: packaging === "auto" ? "" : packaging,
                })
              }
              disabled={generateProductPhoto.isPending}
            >
              <Sparkles className="size-4" />
              {generateProductPhoto.isPending ? "A gerar…" : "Gerar imagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
