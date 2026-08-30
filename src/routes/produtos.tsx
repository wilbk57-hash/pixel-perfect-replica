import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Pencil, Tag, Sparkles, ImageOff, Trash2, RotateCcw } from "lucide-react";
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
import { money, qty, UNITS, PRODUCT_TYPES } from "@/lib/format";
import {
  runOrQueue,
  usePendingQueue,
  type ProductUpsertPayload,
  type CategoryInsertPayload,
} from "@/lib/offline-queue";

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

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function ProductsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [imageTarget, setImageTarget] = useState<{ id: string; name: string; description: string } | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [packaging, setPackaging] = useState("auto");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
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

  const pendingProducts = usePendingQueue("product_upsert");

  const mergedProducts = useMemo(() => {
    const base = products.data ?? [];
    const byId = new Map(base.map((p) => [p.id, { ...p, _pending: false } as any]));
    const extra: any[] = [];
    for (const item of pendingProducts) {
      const payload = item.payload;
      if (payload.id && byId.has(payload.id)) {
        byId.set(payload.id, { ...byId.get(payload.id), ...payload, _pending: true });
      } else if (!payload.id) {
        extra.push({
          ...payload,
          id: item.localId,
          current_stock: payload.current_stock ?? 0,
          image_url: null,
          status: "ACTIVE",
          _pending: true,
        });
      }
    }
    return [...Array.from(byId.values()), ...extra];
  }, [products.data, pendingProducts]);

  const saveProduct = useMutation({
    mutationFn: async (d: Draft) => {
      const payload: ProductUpsertPayload = {
        id: d.id,
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
        ...(d.id ? {} : { current_stock: Number(d.current_stock) || 0 }),
      };
      return runOrQueue("product_upsert", payload, d.id ? "Edição de produto" : "Novo produto", async () => {
        if (payload.id) {
          const { id, current_stock: _cs, ...rest } = payload;
          const { error } = await supabase.from("products").update(rest).eq("id", id);
          if (error) throw error;
        } else {
          const { id: _omit, ...insertData } = payload;
          const { error } = await supabase
            .from("products")
            .insert({ ...insertData, current_stock: insertData.current_stock ?? 0 });
          if (error) throw error;
        }
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.offline
          ? "Sem ligação — produto guardado neste aparelho. Toque em \"Sincronizar\" quando voltar online."
          : "Produto guardado",
      );
      setOpen(false);
      setDraft(EMPTY);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCategory = useMutation({
    mutationFn: async (name: string) => {
      const payload: CategoryInsertPayload = { user_id: user!.id, name };
      return runOrQueue("category_insert", payload, "Nova categoria", async () => {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      });
    },
    onSuccess: (res) => {
      toast.success(res.offline ? "Sem ligação — categoria guardada neste aparelho" : "Categoria criada");
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

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_product", { p_product_id: id });
      if (error) throw error;
      return data as "deleted" | "archived";
    },
    onSuccess: (result) => {
      toast.success(
        result === "deleted"
          ? "Produto eliminado"
          : "Produto tinha histórico (vendas, receitas ou movimentos) — foi marcado como inativo em vez de apagado",
      );
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ status: "ACTIVE" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto reativado");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = mergedProducts
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => showInactive || p.status === "ACTIVE");
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
                  <select
                    value={draft.category_id ?? "none"}
                    onChange={(e) =>
                      setDraft({ ...draft, category_id: e.target.value === "none" ? null : e.target.value })
                    }
                    className={selectClass}
                  >
                    <option value="none">Sem categoria</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    value={draft.product_type}
                    onChange={(e) => setDraft({ ...draft, product_type: e.target.value })}
                    className={selectClass}
                  >
                    {PRODUCT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <select
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    className={selectClass}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Pesquisar produto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Mostrar inativos
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Card key={p.id} className={`overflow-hidden ${p.status !== "ACTIVE" ? "opacity-60" : ""}`}>
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-8" />
                </div>
              )}
              {p._pending && (
                <Badge variant="outline" className="absolute left-2 top-2 bg-background/90 text-[10px]">
                  Por sincronizar
                </Badge>
              )}
              {p.status !== "ACTIVE" && (
                <Badge variant="secondary" className="absolute left-2 top-2 bg-background/90 text-[10px]">
                  Inativo
                </Badge>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
                <p className="truncate text-sm font-semibold text-white drop-shadow-sm">{p.name}</p>
                <p className="truncate text-xs text-white/80">{catName_(p.category_id)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="absolute right-2 top-2 shadow"
                disabled={generatingId === p.id || (typeof navigator !== "undefined" && !navigator.onLine)}
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
              <div className="flex items-start justify-end gap-1">
                {p.status !== "ACTIVE" ? (
                  <Button variant="ghost" size="icon" title="Reativar" onClick={() => reactivate.mutate(p.id)}>
                    <RotateCcw className="size-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Eliminar"
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
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
              <select value={packaging} onChange={(e) => setPackaging(e.target.value)} className={selectClass}>
                <option value="auto">Automático (a IA escolhe)</option>
                <option value="glass_bottle">Garrafa de vidro</option>
                <option value="plastic_bottle">Garrafa de plástico</option>
                <option value="can">Lata</option>
                <option value="jar">Frasco / jarra</option>
                <option value="box">Caixa / embalagem</option>
                <option value="none">Sem embalagem (só o ingrediente)</option>
              </select>
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

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se este produto já teve vendas, receitas ou movimentos de estoque, não será apagado por completo
            (para não perder o histórico) — fica apenas marcado como inativo e desaparece do PDV e Estoque.
            Se nunca foi usado, é removido definitivamente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteProduct.mutate(deleteTarget.id)}
              disabled={deleteProduct.isPending}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
