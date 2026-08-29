import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getProducts, upsertProduct, deleteProduct } from "@/lib/bk.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fcfa, formatDate } from "@/lib/currency";

export const Route = createFileRoute("/b/$businessId/produtos")({
  ssr: false,
  component: ProductsPage,
});

type FormState = {
  id?: string | null;
  name: string;
  flavor: string;
  unit: string;
  cost_price: string;
  sale_price: string;
  stock_qty: string;
  min_stock: string;
  expiry_date: string;
};

const EMPTY: FormState = {
  id: null,
  name: "",
  flavor: "",
  unit: "un",
  cost_price: "0",
  sale_price: "0",
  stock_qty: "0",
  min_stock: "0",
  expiry_date: "",
};

function ProductsPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const products = useQuery({
    queryKey: ["products", bk.businessId, bk.token],
    queryFn: () => getProducts({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const save = useMutation({
    mutationFn: () =>
      upsertProduct({
        data: {
          businessId: bk.businessId,
          token: bk.token,
          product: {
            id: form.id,
            name: form.name,
            flavor: form.flavor || null,
            unit: form.unit || "un",
            cost_price: Number(form.cost_price) || 0,
            sale_price: Number(form.sale_price) || 0,
            stock_qty: Number(form.stock_qty) || 0,
            min_stock: Number(form.min_stock) || 0,
            expiry_date: form.expiry_date || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Produto guardado");
      setOpen(false);
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["products", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (productId: string) =>
      deleteProduct({ data: { businessId: bk.businessId, token: bk.token, productId } }),
    onSuccess: () => {
      toast.success("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["products", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: {
    id: string;
    name: string;
    flavor: string | null;
    unit: string;
    cost_price: number;
    sale_price: number;
    stock_qty: number;
    min_stock: number;
    expiry_date: string | null;
  }) {
    setForm({
      id: p.id,
      name: p.name,
      flavor: p.flavor ?? "",
      unit: p.unit,
      cost_price: String(p.cost_price),
      sale_price: String(p.sale_price),
      stock_qty: String(p.stock_qty),
      min_stock: String(p.min_stock),
      expiry_date: p.expiry_date ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo com preços e margem de lucro"
        action={
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Novo produto
          </Button>
        }
      />

      {products.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {products.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">Ainda não tem produtos.</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.data?.map((p) => {
          const margin = bk.role === "owner" ? Number(p.sale_price) - Number(p.cost_price) : null;
          return (
            <div key={p.id} className="bk-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{p.name}</p>
                  {p.flavor ? <p className="text-xs text-muted-foreground">{p.flavor}</p> : null}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {bk.role === "owner" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm(`Remover "${p.name}"?`)) remove.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-bold text-leaf">{fcfa(p.sale_price)}</span>
                <span className="text-muted-foreground">{p.stock_qty} {p.unit}</span>
              </div>
              {margin !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">Margem: {fcfa(margin)}</p>
              ) : null}
              {p.expiry_date ? (
                <p className="mt-1 text-xs text-mango">Val.: {formatDate(p.expiry_date)}</p>
              ) : null}
              {Number(p.stock_qty) <= Number(p.min_stock) ? (
                <p className="mt-1 text-xs font-medium text-destructive">Estoque baixo</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="p-name">Nome</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-flavor">Sabor</Label>
                <Input id="p-flavor" value={form.flavor} onChange={(e) => setForm({ ...form, flavor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-unit">Unidade</Label>
                <Input id="p-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="un" />
              </div>
              {bk.role === "owner" ? (
                <div className="space-y-2">
                  <Label htmlFor="p-cost">Preço de custo (FCFA)</Label>
                  <Input
                    id="p-cost"
                    type="number"
                    min={0}
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="p-price">Preço de venda (FCFA)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  value={form.sale_price}
                  onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-stock">Estoque atual</Label>
                <Input
                  id="p-stock"
                  type="number"
                  value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-min">Estoque mínimo</Label>
                <Input
                  id="p-min"
                  type="number"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="p-expiry">Data de validade</Label>
                <Input
                  id="p-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "A guardar..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
