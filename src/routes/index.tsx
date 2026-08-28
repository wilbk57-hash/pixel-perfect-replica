import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  HandCoins,
  Boxes,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money, qty, shortDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — BK BUSINESS" },
      {
        name: "description",
        content: "Indicadores do dia: vendas, lucro bruto, dívidas de clientes e alertas de estoque.",
      },
      { property: "og:title", content: "Painel — BK BUSINESS" },
      { property: "og:description", content: "Indicadores de vendas, lucro, dívidas e estoque." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [sales, products, debts, recent] = await Promise.all([
        supabase.from("sales").select("final_total, gross_profit, created_at").eq("status", "COMPLETED"),
        supabase.from("products").select("id, name, current_stock, min_stock, unit, cost_price").eq("status", "ACTIVE"),
        supabase.from("customer_debts").select("remaining_amount").neq("status", "PAID"),
        supabase
          .from("sales")
          .select("id, sale_number, customer_name, final_total, payment_status, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const all = sales.data ?? [];
      const todaySales = all.filter((s) => new Date(s.created_at) >= today);
      const list = products.data ?? [];

      return {
        todayTotal: todaySales.reduce((a, s) => a + Number(s.final_total), 0),
        todayProfit: todaySales.reduce((a, s) => a + Number(s.gross_profit), 0),
        todayCount: todaySales.length,
        monthTotal: all
          .filter((s) => new Date(s.created_at).getMonth() === today.getMonth())
          .reduce((a, s) => a + Number(s.final_total), 0),
        debtTotal: (debts.data ?? []).reduce((a, d) => a + Number(d.remaining_amount), 0),
        stockValue: list.reduce((a, p) => a + Number(p.current_stock) * Number(p.cost_price), 0),
        lowStock: list.filter((p) => Number(p.current_stock) <= Number(p.min_stock)),
        recent: recent.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Vendas de hoje", value: money(data?.todayTotal), icon: ShoppingCart, hint: `${data?.todayCount ?? 0} venda(s)` },
    { label: "Lucro bruto hoje", value: money(data?.todayProfit), icon: TrendingUp, hint: "margem do dia" },
    { label: "Vendas do mês", value: money(data?.monthTotal), icon: TrendingUp, hint: "acumulado" },
    { label: "Dívidas por receber", value: money(data?.debtTotal), icon: HandCoins, hint: "clientes a crédito" },
  ];

  return (
    <AppShell
      title="Painel"
      subtitle="Visão geral do negócio"
      actions={
        <Button asChild>
          <Link to="/pdv">
            <ShoppingCart className="size-4" /> Nova venda
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-none">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{c.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
                </div>
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <c.icon className="size-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Últimas vendas</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/vendas">
                Ver todas <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.recent ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Ainda sem vendas registadas.</p>
            ) : (
              data?.recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.sale_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.customer_name} · {shortDate(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={s.payment_status === "PAID" ? "secondary" : "destructive"}>
                      {s.payment_status === "PAID" ? "Pago" : s.payment_status === "PARTIAL" ? "Parcial" : "Fiado"}
                    </Badge>
                    <span className="text-sm font-semibold">{money(Number(s.final_total))}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="size-4" /> Valor em estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{money(data?.stockValue)}</p>
              <p className="text-xs text-muted-foreground">a preço de custo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-citrus" /> Estoque baixo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.lowStock ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Tudo em ordem.</p>
              ) : (
                data?.lowStock.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="font-medium text-destructive">
                      {qty(Number(p.current_stock))} {p.unit}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
