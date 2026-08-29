import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getProducts, changeStock } from "@/lib/bk.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/currency";

export const Route = createFileRoute("/b/$businessId/estoque")({
  ssr: false,
  component: StockPage,
});

function StockPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const products = useQuery({
    queryKey: ["products", bk.businessId, bk.token],
    queryFn: () => getProducts({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const adjust = useMutation({
    mutationFn: ({ productId, delta }: { productId: string; delta: number }) =>
      changeStock({ data: { businessId: bk.businessId, token: bk.token, productId, delta } }),
    onSuccess: () => {
      toast.success("Estoque atualizado");
      queryClient.invalidateQueries({ queryKey: ["products", bk.businessId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function amountFor(productId: string) {
    const raw = Number(amounts[productId]);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque" subtitle="Ajuste rápido de quantidade por produto" />

      {products.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {products.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">Ainda não tem produtos.</div>
      ) : null}

      <div className="space-y-3">
        {products.data?.map((p) => {
          const low = Number(p.stock_qty) <= Number(p.min_stock);
          return (
            <div key={p.id} className="bk-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.stock_qty} {p.unit} em estoque · mínimo {p.min_stock}
                  {p.expiry_date ? ` · val. ${formatDate(p.expiry_date)}` : ""}
                </p>
                {low ? <p className="text-xs font-medium text-destructive">Estoque baixo</p> : null}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => adjust.mutate({ productId: p.id, delta: -amountFor(p.id) })}
                  disabled={adjust.isPending}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  className="w-16 text-center"
                  value={amounts[p.id] ?? ""}
                  placeholder="1"
                  onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => adjust.mutate({ productId: p.id, delta: amountFor(p.id) })}
                  disabled={adjust.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
