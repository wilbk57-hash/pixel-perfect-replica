import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getCustomers, upsertCustomer } from "@/lib/bk.functions";
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

export const Route = createFileRoute("/b/$businessId/clientes")({
  ssr: false,
  component: CustomersPage,
});

type FormState = {
  id?: string | null;
  name: string;
  phone: string;
  address: string;
};

const EMPTY: FormState = { id: null, name: "", phone: "", address: "" };

function CustomersPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const customers = useQuery({
    queryKey: ["customers", bk.businessId, bk.token, search],
    queryFn: () =>
      getCustomers({ data: { businessId: bk.businessId, token: bk.token, search: search || null } }),
  });

  const save = useMutation({
    mutationFn: () =>
      upsertCustomer({
        data: {
          businessId: bk.businessId,
          token: bk.token,
          customer: {
            id: form.id,
            name: form.name,
            phone: form.phone || null,
            address: form.address || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Cliente guardado");
      setOpen(false);
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["customers", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: { id: string; name: string; phone: string | null; address: string | null }) {
    setForm({ id: c.id, name: c.name, phone: c.phone ?? "", address: c.address ?? "" });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle="Pesquise por nome ou adicione um novo"
        action={
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Novo cliente
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Pesquisar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {customers.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {customers.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {customers.data?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openEdit(c)}
            className="bk-card p-4 text-left transition-transform hover:-translate-y-0.5"
          >
            <p className="font-semibold text-foreground">{c.name}</p>
            {c.phone ? <p className="text-sm text-muted-foreground">{c.phone}</p> : null}
            {c.address ? <p className="text-xs text-muted-foreground">{c.address}</p> : null}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="c-name">Nome</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-phone">Telefone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-address">Endereço</Label>
              <Input id="c-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "A guardar..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
