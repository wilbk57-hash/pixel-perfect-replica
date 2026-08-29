import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";

import { useBk, PageHeader } from "@/components/business-shell";
import { getEmployees, createEmployee, deleteEmployee } from "@/lib/bk.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/b/$businessId/equipa")({
  ssr: false,
  component: TeamPage,
});

function TeamPage() {
  const bk = useBk();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const employees = useQuery({
    queryKey: ["employees", bk.businessId, bk.token],
    queryFn: () => getEmployees({ data: { businessId: bk.businessId, token: bk.token } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createEmployee({
        data: {
          businessId: bk.businessId,
          token: bk.token,
          full_name: fullName,
          job_title: jobTitle,
          phone: phone || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Funcionário adicionado");
      setOpen(false);
      setFullName("");
      setJobTitle("");
      setPhone("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["employees", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (employeeId: string) =>
      deleteEmployee({ data: { businessId: bk.businessId, token: bk.token, employeeId } }),
    onSuccess: () => {
      toast.success("Funcionário removido");
      queryClient.invalidateQueries({ queryKey: ["employees", bk.businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function linkFor(token: string) {
    return `${window.location.origin}/e/${token}`;
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(linkFor(token));
    toast.success("Link copiado");
  }

  if (bk.role !== "owner") {
    return <p className="text-muted-foreground">Apenas o dono pode gerir a equipa.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipa"
        subtitle="Adicione funcionários e partilhe o link de acesso"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo funcionário
          </Button>
        }
      />

      {employees.isLoading ? <p className="text-muted-foreground">A carregar...</p> : null}
      {employees.data?.length === 0 ? (
        <div className="bk-card p-8 text-center text-muted-foreground">
          Ainda não tem funcionários. Adicione o primeiro.
        </div>
      ) : null}

      <div className="space-y-3">
        {employees.data?.map((e) => (
          <div key={e.id} className="bk-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{e.full_name}</p>
                <p className="text-sm text-muted-foreground">{e.job_title}</p>
                {e.phone ? <p className="text-xs text-muted-foreground">{e.phone}</p> : null}
                {e.notes ? <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p> : null}
                {!e.active ? <p className="mt-1 text-xs font-medium text-destructive">Inativo</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => copyLink(e.access_token)}>
                  <Copy className="mr-1 h-3 w-3" /> Copiar link
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive"
                  onClick={() => {
                    if (confirm(`Remover "${e.full_name}"?`)) remove.mutate(e.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo funcionário</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="e-name">Nome completo</Label>
              <Input id="e-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-role">Função</Label>
              <Input id="e-role" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required placeholder="Vendedor" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-phone">Telefone</Label>
              <Input id="e-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-notes">Notas</Label>
              <Textarea id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "A guardar..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
