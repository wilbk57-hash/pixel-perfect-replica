import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, qty, shortDate } from "@/lib/format";
import { runOrQueue, usePendingQueue, type AdjustStockPayload } from "@/lib/offline-queue";

export const Route = createFileRoute("/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — BK BUSINESS" },
      { name: "description", content: "Entradas, saídas, perdas e histórico de movimentos de estoque." },
      { property: "og:title", content: "Estoque — BK BUSINESS" },
      { property: "og:description", content: "Controlo de entradas, saídas e movimentos de estoque." },
    ],
  }),
  component: InventoryPage,
});

const MOVE_TYPES = [
  { value: "PURCHASE", label: "Compra (entrada)", sign: 1 },
  { value: "ADJUSTMENT_IN", label: "Ajuste de entrada", sign: 1 },
  { value: "RETURN", label: "Devolução (entrada)", sign: 1 },
  { value: "LOSS", label: "Perda / quebra (saída)", sign: -1 },
  { value: "ADJUSTMENT_OUT", label: "Ajuste de saída", sign: -1 },
];

function InventoryPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("PURCHASE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const products = useQuery({
    queryKey: ["products", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("status", "ACTIVE")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const movements = useQuery({
    queryKey: ["movements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const pendingMoves = usePendingQueue("adjust_stock");

  function openRestock(id: string) {
    setProductId(id);
    setType("PURCHASE");
    setAmount("");
    setReason("");
    setOpen(true);
  }

  const move = useMutation({
    mutationFn: async () => {
      const sign = MOVE_TYPES.find((m) => m.value === type)?.sign ?? 1;
      const payload: AdjustStockPayload = {
        p_product_id: productId,
        p_quantity: sign * (Number(amount) || 0),
        p_type: type,
        p_reason: reason,
      };
      return runOrQueue("adjust_stock", payload, "Movimento de estoque", async () => {
        const { error } = await supabase.rpc("adjust_stock", payload as any);
        if (error) throw error;
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.offline
          ? "Sem ligação — movimento guardado neste aparelho. Toque em \"Sincronizar\" quando voltar online."
          : "Movimento registado",
      );
      setOpen(false);
      setAmount("");
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = products.data ?? [];
  const totalValue = list.reduce((a, p) => a + Number(p.current_stock) * Number(p.cost_price ?? 0), 0);
  const low = list.filter((p) => Number(p.current_stock) <= Number(p.min_stock));

  return (
    <AppShell
      title="Estoque"
      subtitle={
        isAdmin
          ? `${list.length} produto(s) · ${money(totalValue)} em custo`
          : `${list.length} produto(s)`
      }
      actions={<Button onClick={() => setOpen(true)}>Registar movimento</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {list.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin
                      ? `mínimo ${qty(Number(p.min_stock))} ${p.unit} · custo ${money(Number(p.cost_price ?? 0))}`
                      : `mínimo ${qty(Number(p.min_stock))} ${p.unit}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={Number(p.current_stock) <= Number(p.min_stock) ? "destructive" : "secondary"}>
                    {qty(Number(p.current_stock))} {p.unit}
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    title="Reabastecer"
                    onClick={() => openRestock(p.id)}
                  >
                    <PackagePlus className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {list.length === 0 && <p className="text-sm text-muted-foreground">Sem produtos ainda.</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Alertas ({low.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {low.length === 0 ? (
                <p className="text-muted-foreground">Nenhum produto abaixo do mínimo.</p>
              ) : (
                low.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="font-medium text-destructive">
                      {qty(Number(p.current_stock))} {p.unit}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openRestock(p.id)}>
                      Reabastecer
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Movimentos recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pendingMoves.map((m) => {
                const prod = list.find((p) => p.id === m.payload.p_product_id);
                return (
                  <div key={m.localId} className="flex items-start gap-2 opacity-70">
                    {m.payload.p_quantity >= 0 ? (
                      <ArrowUpCircle className="mt-0.5 size-4 text-success" />
                    ) : (
                      <ArrowDownCircle className="mt-0.5 size-4 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {prod?.name ?? "Produto"} · {qty(m.payload.p_quantity)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.payload.p_reason || m.payload.p_type} · Por sincronizar
                      </p>
                    </div>
                  </div>
                );
              })}
              {(movements.data ?? []).map((m) => (
                <div key={m.id} className="flex items-start gap-2">
                  {Number(m.quantity) >= 0 ? (
                    <ArrowUpCircle className="mt-0.5 size-4 text-success" />
                  ) : (
                    <ArrowDownCircle className="mt-0.5 size-4 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {m.product_name} · {qty(Number(m.quantity))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.reason || m.type} · {shortDate(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {pendingMoves.length === 0 && (movements.data ?? []).length === 0 && (
                <p className="text-muted-foreground">Sem movimentos.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimento de estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher produto" />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVE_TYPES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => move.mutate()} disabled={!productId || !amount || move.isPending}>
              Registar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
