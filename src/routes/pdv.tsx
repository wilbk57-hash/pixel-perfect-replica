import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, qty, PAYMENT_METHODS } from "@/lib/format";

export const Route = createFileRoute("/pdv")({
  head: () => ({
    meta: [
      { title: "PDV — BK BUSINESS" },
      { name: "description", content: "Ponto de venda rápido: carrinho, descontos, pagamento e vendas a crédito." },
      { property: "og:title", content: "PDV — BK BUSINESS" },
      { property: "og:description", content: "Ponto de venda rápido com controlo de estoque." },
    ],
  }),
  component: PosPage,
});

type CartItem = { product_id: string; name: string; unit: string; price: number; stock: number; quantity: number };

function PosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("none");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("CASH");

  const products = useQuery({
    queryKey: ["pos-products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, sale_price, current_stock")
        .eq("status", "ACTIVE")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const customers = useQuery({
    queryKey: ["customers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const subtotal = useMemo(() => cart.reduce((a, i) => a + i.price * i.quantity, 0), [cart]);
  const total = Math.max(subtotal - (Number(discount) || 0), 0);
  const paidValue = paid === "" ? total : Number(paid) || 0;
  const debt = Math.max(total - paidValue, 0);

  const checkout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_sale", {
        p_items: cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.price })),
        ...(customerId === "none" ? {} : { p_customer_id: customerId }),
        p_discount: Number(discount) || 0,
        p_paid: paidValue,
        p_payment_method: method,
        p_notes: "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registada");
      setCart([]);
      setDiscount("0");
      setPaid("");
      setCustomerId("none");
      qc.invalidateQueries();
      navigate({ to: "/vendas" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function add(p: { id: string; name: string; unit: string; sale_price: number; current_stock: number }) {
    setCart((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) {
        if (found.quantity + 1 > p.current_stock) {
          toast.error(`Estoque insuficiente de ${p.name}`);
          return prev;
        }
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      if (Number(p.current_stock) <= 0) {
        toast.error(`${p.name} sem estoque`);
        return prev;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          unit: p.unit,
          price: Number(p.sale_price),
          stock: Number(p.current_stock),
          quantity: 1,
        },
      ];
    });
  }

  const filtered = (products.data ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell title="Ponto de venda" subtitle="Registe vendas em segundos">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <Input
            placeholder="Pesquisar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => add(p)} className="text-left">
                <Card className="h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <CardContent className="pt-6">
                    <p className="truncate font-medium">{p.name}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold">{money(Number(p.sale_price))}</span>
                      <Badge variant={Number(p.current_stock) <= 0 ? "destructive" : "secondary"}>
                        {qty(Number(p.current_stock))} {p.unit}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto disponível.</p>}
          </div>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="size-4" /> Carrinho
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carrinho vazio.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((i) => (
                  <div key={i.product_id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setCart((c) => c.filter((x) => x.product_id !== i.product_id))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            setCart((c) =>
                              c
                                .map((x) =>
                                  x.product_id === i.product_id ? { ...x, quantity: x.quantity - 1 } : x,
                                )
                                .filter((x) => x.quantity > 0),
                            )
                          }
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-10 text-center text-sm font-medium">{qty(i.quantity)}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            setCart((c) =>
                              c.map((x) =>
                                x.product_id === i.product_id && x.quantity < x.stock
                                  ? { ...x, quantity: x.quantity + 1 }
                                  : x,
                              ),
                            )
                          }
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <span className="text-sm font-semibold">{money(i.price * i.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cliente não identificado</SelectItem>
                    {customers.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Desconto</Label>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Valor pago</Label>
                  <Input
                    type="number"
                    placeholder={String(total)}
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Pagamento</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              {debt > 0 && (
                <div className="flex justify-between font-medium text-destructive">
                  <span>Fica a dever</span>
                  <span>{money(debt)}</span>
                </div>
              )}
              {paidValue > total && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Troco</span>
                  <span>{money(paidValue - total)}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              Finalizar venda
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
