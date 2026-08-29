import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useBk, PageHeader } from "@/components/business-shell";
import { getSales } from "@/lib/bk.functions";
import { fcfa } from "@/lib/currency";

export const Route = createFileRoute("/b/$businessId/vendas")({
  ssr: false,
  component: SalesPage,
});

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência",
  mobile: "Mobile money",
};

function SalesPage() {
  const bk = useBk();

  const sales = useQuery({
    queryKey: ["sales", bk.businessId, bk.token],
    queryFn: () => getSales({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const totalRevenue = sales.data?.reduce((acc, s) => acc + s.total, 0) ?? 0;
  const totalProfit =
    bk.role === "owner" ? sales.data?.reduce((acc, s) => acc + (s.profit ?? 0), 0) ?? 0 : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Vendas" subtitle="Histórico das últimas 200 vendas" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bk-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receita total</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{fcfa(totalRevenue)}</p>
        </div>
        {totalProfit !== null ? (
          <div className="bk-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lucro total</p>
            <p className="mt-1 text-2xl font-bold text-leaf">{fcfa(totalProfit)}</p>
          </div>
        ) : null}
      </div>

      {sales.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {sales.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">Ainda não há vendas registadas.</div>
      ) : null}

      <div className="space-y-3">
        {sales.data?.map((s) => (
          <div key={s.id} className="bk-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">
                  {s.customer_name ?? "Cliente não identificado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString("pt-PT")} · {PAYMENT_LABEL[s.payment_method] ?? s.payment_method}
                  {s.seller_label ? ` · ${s.seller_label}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{fcfa(s.total)}</p>
                {s.profit !== null ? (
                  <p className="text-xs text-muted-foreground">Lucro: {fcfa(s.profit)}</p>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 space-y-1 border-t pt-3 text-sm text-muted-foreground">
              {s.items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {item.qty}× {item.product_name}
                  </span>
                  <span>{fcfa(item.unit_price * item.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
