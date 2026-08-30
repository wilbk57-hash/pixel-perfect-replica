import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendDebtReminder } from "@/lib/whatsapp.functions";
import { money, shortDate, PAYMENT_METHODS } from "@/lib/format";
import { runOrQueue, usePendingQueue, type PayDebtPayload } from "@/lib/offline-queue";

export const Route = createFileRoute("/dividas")({
  head: () => ({
    meta: [
      { title: "Dívidas de clientes — BK BUSINESS" },
      { name: "description", content: "Controlo de vendas a crédito, valores em dívida e recebimentos de clientes." },
      { property: "og:title", content: "Dívidas — BK BUSINESS" },
      { property: "og:description", content: "Controlo de crédito e recebimentos." },
    ],
  }),
  component: DebtsPage,
});

function DebtsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sendReminder = useServerFn(sendDebtReminder);
  const [debtId, setDebtId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const debts = useQuery({
    queryKey: ["debts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_debts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const payments = useQuery({
    queryKey: ["payments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const pendingPayments = usePendingQueue("pay_debt");

  const pay = useMutation({
    mutationFn: async () => {
      const payload: PayDebtPayload = {
        p_debt_id: debtId!,
        p_amount: Number(amount) || 0,
        p_method: method,
        p_notes: "",
      };
      return runOrQueue("pay_debt", payload, "Recebimento", async () => {
        const { error } = await supabase.rpc("pay_debt", payload as any);
        if (error) throw error;
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.offline
          ? "Sem ligação — recebimento guardado neste aparelho. Toque em \"Sincronizar\" quando voltar online."
          : "Pagamento registado",
      );
      setDebtId(null);
      setAmount("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remind = useMutation({
    mutationFn: async (id: string) => {
      setRemindingId(id);
      return await sendReminder({ data: { debtId: id } });
    },
    onSettled: () => setRemindingId(null),
    onSuccess: (res) => {
      if (res.sent) {
        toast.success("Lembrete enviado por WhatsApp");
        qc.invalidateQueries();
        return;
      }
      if (res.waLink) {
        window.open(res.waLink, "_blank", "noopener");
        toast.message(res.error || "Abrimos o WhatsApp com a mensagem pronta.");
      } else {
        toast.error(res.error || "Não foi possível enviar o lembrete.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (debts.data ?? []).filter((d) => d.status !== "PAID");
  const totalOpen = open.reduce((a, d) => a + Number(d.remaining_amount), 0);
  const current = (debts.data ?? []).find((d) => d.id === debtId);

  return (
    <AppShell title="Dívidas" subtitle={`${open.length} em aberto · ${money(totalOpen)} por receber`}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(debts.data ?? []).map((d) => {
            const hasPendingPayment = pendingPayments.some((p) => p.payload.p_debt_id === d.id);
            return (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.sale_number || "Manual"} · {shortDate(d.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasPendingPayment && (
                      <Badge variant="outline" className="text-[10px]">
                        Pagamento por sincronizar
                      </Badge>
                    )}
                    <Badge variant={d.status === "PAID" ? "secondary" : "destructive"}>
                      {d.status === "PAID" ? "Pago" : d.status === "PARTIAL" ? "Parcial" : "Pendente"}
                    </Badge>
                    <div className="text-right">
                      <p className="font-bold">{money(Number(d.remaining_amount))}</p>
                      <p className="text-xs text-muted-foreground">de {money(Number(d.original_amount))}</p>
                    </div>
                    {d.status !== "PAID" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => remind.mutate(d.id)}
                          disabled={remindingId === d.id}
                        >
                          <MessageCircle className="size-4" />
                          {remindingId === d.id ? "A enviar…" : "Lembrar"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setDebtId(d.id);
                            setAmount(String(d.remaining_amount));
                          }}
                        >
                          Receber
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(debts.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma dívida registada.</p>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">Últimos recebimentos</p>
            {pendingPayments.map((p) => {
              const debt = (debts.data ?? []).find((d) => d.id === p.payload.p_debt_id);
              return (
                <div key={p.localId} className="flex items-start justify-between text-sm opacity-70">
                  <div className="min-w-0">
                    <p className="truncate">{debt?.customer_name ?? "Cliente"}</p>
                    <p className="text-xs text-muted-foreground">Por sincronizar</p>
                  </div>
                  <span className="font-medium text-success">{money(p.payload.p_amount)}</span>
                </div>
              );
            })}
            {(payments.data ?? []).map((p) => (
              <div key={p.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate">{p.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{shortDate(p.created_at)}</p>
                </div>
                <span className="font-medium text-success">{money(Number(p.amount))}</span>
              </div>
            ))}
            {pendingPayments.length === 0 && (payments.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sem recebimentos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!debtId} onOpenChange={(v) => !v && setDebtId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber de {current?.customer_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((m) => m.value !== "CREDIT").map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => pay.mutate()} disabled={!amount || pay.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
