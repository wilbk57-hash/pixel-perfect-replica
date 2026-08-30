import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Phone, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { money, shortDate } from "@/lib/format";
import { runOrQueue, usePendingQueue, type CustomerUpsertPayload } from "@/lib/offline-queue";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — BK BUSINESS" },
      { name: "description", content: "Base de clientes com contactos, limite de crédito, dívida atual e total gasto." },
      { property: "og:title", content: "Clientes — BK BUSINESS" },
      { property: "og:description", content: "Clientes, crédito e histórico de compras." },
    ],
  }),
  component: CustomersPage,
});

type Draft = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  credit_limit: string;
};

const EMPTY: Draft = { name: "", phone: "", email: "", address: "", notes: "", credit_limit: "0" };

function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const customers = useQuery({
    queryKey: ["customers-full", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["customer-history", historyFor?.id],
    enabled: !!historyFor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, final_total, paid_amount, remaining_debt, payment_status, created_at")
        .eq("customer_id", historyFor!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const pendingCustomers = usePendingQueue("customer_upsert");

  const mergedCustomers = useMemo(() => {
    const base = customers.data ?? [];
    const byId = new Map(base.map((c) => [c.id, { ...c, _pending: false } as any]));
    const extra: any[] = [];
    for (const item of pendingCustomers) {
      const payload = item.payload;
      if (payload.id && byId.has(payload.id)) {
        byId.set(payload.id, { ...byId.get(payload.id), ...payload, _pending: true });
      } else if (!payload.id) {
        extra.push({
          ...payload,
          id: item.localId,
          total_spent: 0,
          current_debt: 0,
          is_active: true,
          _pending: true,
        });
      }
    }
    return [...Array.from(byId.values()), ...extra];
  }, [customers.data, pendingCustomers]);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload: CustomerUpsertPayload = {
        id: d.id,
        user_id: user!.id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        address: d.address,
        notes: d.notes,
        credit_limit: Number(d.credit_limit) || 0,
      };
      return runOrQueue("customer_upsert", payload, d.id ? "Edição de cliente" : "Novo cliente", async () => {
        if (payload.id) {
          const { id, ...rest } = payload;
          const { error } = await supabase.from("customers").update(rest).eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("customers").insert(payload);
          if (error) throw error;
        }
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.offline
          ? "Sem ligação — cliente guardado neste aparelho. Toque em \"Sincronizar\" quando voltar online."
          : "Cliente guardado",
      );
      setOpen(false);
      setDraft(EMPTY);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = mergedCustomers.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );

  const histTotals = (history.data ?? []).reduce(
    (a, s) => ({ paid: a.paid + Number(s.paid_amount), owed: a.owed + Number(s.remaining_debt) }),
    { paid: 0, owed: 0 },
  );

  return (
    <AppShell
      title="Clientes"
      subtitle={`${list.length} cliente(s)`}
      actions={
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setDraft(EMPTY);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{draft.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Morada</Label>
                <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Limite de crédito</Label>
                <Input
                  type="number"
                  value={draft.credit_limit}
                  onChange={(e) => setDraft({ ...draft, credit_limit: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notas</Label>
                <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate(draft)} disabled={!draft.name.trim()}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Input
        placeholder="Pesquisar cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{c.name}</p>
                    {c._pending && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Por sincronizar
                      </Badge>
                    )}
                  </div>
                  {c.phone ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3" /> {c.phone}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={c._pending}
                    onClick={() => setHistoryFor({ id: c.id, name: c.name })}
                  >
                    <History className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDraft({
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        email: c.email,
                        address: c.address,
                        notes: c.notes,
                        credit_limit: String(c.credit_limit),
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total gasto</p>
                  <p className="font-bold">{money(Number(c.total_spent))}</p>
                </div>
                <Badge variant={Number(c.current_debt) > 0 ? "destructive" : "secondary"}>
                  dívida {money(Number(c.current_debt))}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </div>

      <Dialog open={!!historyFor} onOpenChange={(v) => !v && setHistoryFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de {historyFor?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-3 rounded-lg border p-3 text-sm">
            <div className="flex-1">
              <p className="text-muted-foreground">Total pago</p>
              <p className="font-bold text-success">{money(histTotals.paid)}</p>
            </div>
            <div className="flex-1">
              <p className="text-muted-foreground">Total em dívida</p>
              <p className="font-bold text-destructive">{money(histTotals.owed)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {(history.data ?? []).map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.sale_number}</p>
                    <p className="text-xs text-muted-foreground">{shortDate(s.created_at)}</p>
                  </div>
                  <Badge variant={s.payment_status === "PAID" ? "secondary" : "destructive"}>
                    {s.payment_status === "PAID" ? "Pago" : s.payment_status === "PARTIAL" ? "Parcial" : "Fiado"}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Total {money(Number(s.final_total))}</span>
                  <span className="text-success">pago {money(Number(s.paid_amount))}</span>
                  {Number(s.remaining_debt) > 0 && (
                    <span className="font-medium text-destructive">deve {money(Number(s.remaining_debt))}</span>
                  )}
                </div>
              </div>
            ))}
            {(history.data ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Ainda sem compras registadas.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
