import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money, qty, shortDate } from "@/lib/format";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [
      { title: "Histórico de vendas — BK BUSINESS" },
      { name: "description", content: "Histórico completo de vendas com itens, lucro e estado de pagamento." },
      { property: "og:title", content: "Vendas — BK BUSINESS" },
      { property: "og:description", content: "Histórico de vendas, lucro e pagamentos." },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  const sales = useQuery({
    queryKey: ["sales", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["sale-items", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items").select("*").eq("sale_id", openId!);
      if (error) throw error;
      return data;
    },
  });

  const totals = (sales.data ?? []).reduce(
    (a, s) => ({ total: a.total + Number(s.final_total), profit: a.profit + Number(s.gross_profit) }),
    { total: 0, profit: 0 },
  );

  return (
    <AppShell title="Vendas" subtitle={`${sales.data?.length ?? 0} venda(s) · ${money(totals.total)} · lucro ${money(totals.profit)}`}>
      <div className="space-y-3">
        {(sales.data ?? []).map((s) => (
          <Card key={s.id}>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.sale_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.customer_name} · {shortDate(s.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={s.payment_status === "PAID" ? "secondary" : "destructive"}>
                    {s.payment_status === "PAID" ? "Pago" : s.payment_status === "PARTIAL" ? "Parcial" : "Fiado"}
                  </Badge>
                  <div className="text-right">
                    <p className="font-bold">{money(Number(s.final_total))}</p>
                    <p className="text-xs text-muted-foreground">lucro {money(Number(s.gross_profit))}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                    {openId === s.id ? "Fechar" : "Detalhes"}
                  </Button>
                </div>
              </div>

              {openId === s.id && (
                <div className="mt-4 space-y-2 border-t pt-4 text-sm">
                  {(items.data ?? []).map((i) => (
                    <div key={i.id} className="flex justify-between">
                      <span>
                        {qty(Number(i.quantity))} {i.product_unit} · {i.product_name}
                      </span>
                      <span className="font-medium">{money(Number(i.subtotal))}</span>
                    </div>
                  ))}
                  {Number(s.discount_amount) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Desconto</span>
                      <span>-{money(Number(s.discount_amount))}</span>
                    </div>
                  )}
                  {Number(s.remaining_debt) > 0 && (
                    <div className="flex justify-between font-medium text-destructive">
                      <span>Em dívida</span>
                      <span>{money(Number(s.remaining_debt))}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(sales.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Ainda não existem vendas.</p>
        )}
      </div>
    </AppShell>
  );
}
