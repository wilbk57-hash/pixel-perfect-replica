import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getProducts, createSale } from "@/lib/bk.functions";
import { Button } from "@/components/ui/button";
import { fcfa } from "@/lib/currency";

export const Route = createFileRoute("/b/$businessId/pdv")({
  ssr: false,
  component: PdvPage,
});

type CartLine = { product_id: string; name: string; price: number; qty: number };

function PdvPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartLine[]>([]);

  const products = useQuery({
    queryKey: ["products", bk.businessId, bk.token],
    queryFn: () => getProducts({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const sale = useMutation({
    mutationFn: () =>
      createSale({
        data: {
          businessId: bk.businessId,
          token: bk.token,
          items: cart.map((c) => ({ product_id: c.product_id, qty: c.qty })),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Venda registada: ${fcfa(res.total)}`);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["products", bk.businessId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", bk.businessId] });
      queryClient.invalidateQueries({ queryKey: ["sales", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addToCart(p: { id: string; name: string; sale_price: number; stock_qty: number }) {
    if (Number(p.stock_qty) <= 0) {
      toast.error("Sem estoque");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === p.id);
      if (existing) {
        return prev.map((c) => (c.product_id === p.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { product_id: p.id, name: p.name, price: Number(p.sale_price), qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.product_id === productId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  }

  const total = cart.reduce((acc, c) => acc + c.price * c.qty, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="PDV" subtitle="Venda rápida em poucos toques" />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          {products.isLoading ? <p className="text-muted-foreground">A carregar produtos...</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.data?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                disabled={Number(p.stock_qty) <= 0}
                className="bk-card p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <p className="font-semibold text-foreground">{p.name}</p>
                {p.flavor ? <p className="text-xs text-muted-foreground">{p.flavor}</p> : null}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-leaf">{fcfa(p.sale_price)}</span>
                  <span className="text-xs text-muted-foreground">{p.stock_qty} un.</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="bk-card h-fit p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Carrinho</h2>
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Toque num produto para adicionar.</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((c) => (
                <li key={c.product_id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{fcfa(c.price)} / un.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(c.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">{c.qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(c.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeLine(c.product_id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between text-lg font-bold text-foreground">
              <span>Total</span>
              <span>{fcfa(total)}</span>
            </div>
            <Button
              className="mt-4 w-full"
              disabled={cart.length === 0 || sale.isPending}
              onClick={() => sale.mutate()}
            >
              {sale.isPending ? "A registar..." : "Finalizar venda"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
