import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getDebts, createDebt, payDebt, getCustomers } from "@/lib/bk.functions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fcfa, formatDate } from "@/lib/currency";

export const Route = createFileRoute("/b/$businessId/fiado")({
  ssr: false,
  component: DebtsPage,
});

function DebtsPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const [customerId, setCustomerId] = useState<string>("none");
  const [customerName, setCustomerName] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const debts = useQuery({
    queryKey: ["debts", bk.businessId, bk.token],
    queryFn: () => getDebts({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const customers = useQuery({
    queryKey: ["customers", bk.businessId, bk.token, ""],
    queryFn: () => getCustomers({ data: { businessId: bk.businessId, token: bk.token, search: null } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createDebt({
        data: {
          businessId: bk.businessId,
          token: bk.token,
          customer_id: customerId === "none" ? null : customerId,
          customer_name: customerName,
          product_label: productLabel || null,
          amount: Number(amount) || 0,
          due_date: dueDate || null,
        },
      }),
    onSuccess: () => {
      toast.success("Dívida registada");
      setOpen(false);
      setCustomerId("none");
      setCustomerName("");
      setProductLabel("");
      setAmount("");
      setDueDate("");
      queryClient.invalidateQueries({ queryKey: ["debts", bk.businessId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: (debtId: string) =>
      payDebt({ data: { businessId: bk.businessId, token: bk.token, debtId, amount: Number(payAmount) || 0 } }),
    onSuccess: () => {
      toast.success("Pagamento registado");
      setPayOpen(null);
      setPayAmount("");
      queryClient.invalidateQueries({ queryKey: ["debts", bk.businessId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleCustomerSelect(id: string) {
    setCustomerId(id);
    if (id !== "none") {
      const c = customers.data?.find((c) => c.id === id);
      if (c) setCustomerName(c.name);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fiado"
        subtitle="Clientes a crédito, dívidas e pagamentos"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova dívida
          </Button>
        }
      />

      {debts.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {debts.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">Nenhuma dívida registada.</div>
      ) : null}

      <div className="space-y-3">
        {debts.data?.map((d) => {
          const settled = d.remaining <= 0;
          return (
            <div key={d.id} className="bk-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{d.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.product_label ? `${d.product_label} · ` : ""}
                    {d.days_old} dia(s) · {d.due_date ? `vence ${formatDate(d.due_date)}` : "sem prazo"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${settled ? "text-leaf" : "text-destructive"}`}>
                    {settled ? "Pago" : fcfa(d.remaining)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    de {fcfa(d.amount)} · pago {fcfa(d.paid_amount)}
                  </p>
                </div>
              </div>
              {!settled ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setPayOpen(d.id);
                    setPayAmount(String(d.remaining));
                  }}
                >
                  Registar pagamento
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Novo débito */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova dívida</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Cliente existente (opcional)</Label>
              <Select value={customerId} onValueChange={handleCustomerSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente cadastrado</SelectItem>
                  {customers.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-name">Nome do cliente</Label>
              <Input id="d-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-product">Produto / sabor</Label>
              <Input id="d-product" value={productLabel} onChange={(e) => setProductLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-amount">Valor (FCFA)</Label>
              <Input
                id="d-amount"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-due">Data limite (opcional)</Label>
              <Input id="d-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "A guardar..." : "Registar dívida"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pagamento */}
      <Dialog open={!!payOpen} onOpenChange={(v) => !v && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar pagamento</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (payOpen) pay.mutate(payOpen);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Valor pago (FCFA)</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending ? "A guardar..." : "Confirmar pagamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
