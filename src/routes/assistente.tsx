import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { AssistantReport } from "@/components/AssistantReport";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { askAssistant } from "@/lib/assistant.functions";

export const Route = createFileRoute("/assistente")({
  head: () => ({
    meta: [
      { title: "Assistente IA — BK BUSINESS" },
      {
        name: "description",
        content: "Assistente inteligente que analisa o negócio, gera relatórios e edita dados a pedido.",
      },
      { property: "og:title", content: "Assistente IA — BK BUSINESS" },
      { property: "og:description", content: "Relatórios e edições do negócio por comando de voz escrita." },
    ],
  }),
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Faz um relatório das vendas dos últimos 30 dias, com gráfico de evolução",
  "Quais produtos estão com estoque baixo?",
  "Quem são os clientes com maior dívida, numa tabela?",
  "Qual o meu produto mais lucrativo? mostra num gráfico",
];

function AssistantPage() {
  const { user } = useAuth();
  const ask = useServerFn(askAssistant);
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const history = useQuery({
    queryKey: ["assistant-messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistant_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as { id: string; role: "user" | "assistant"; content: string }[];
    },
  });

  const messages: Msg[] = (history.data ?? []).map((m) => ({ role: m.role, content: m.content }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const { error: insErr } = await supabase.from("assistant_messages").insert({
        user_id: user!.id,
        role: "user",
        content: text,
      });
      if (insErr) throw insErr;
      qc.invalidateQueries({ queryKey: ["assistant-messages"] });

      const res = await ask({ data: { messages: [...messages, { role: "user", content: text }] } });

      const { error: repErr } = await supabase.from("assistant_messages").insert({
        user_id: user!.id,
        role: "assistant",
        content: res.reply,
      });
      if (repErr) throw repErr;
      return res.reply;
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearChat = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assistant_messages").delete().eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conversa apagada");
      setClearOpen(false);
      qc.invalidateQueries({ queryKey: ["assistant-messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(text: string) {
    const value = text.trim();
    if (!value || send.isPending) return;
    setInput("");
    send.mutate(value);
  }

  return (
    <AppShell
      title="Assistente IA"
      subtitle="Analisa o negócio, gera relatórios com tabelas e gráficos, e altera dados a pedido"
      adminOnly
      actions={
        messages.length > 0 ? (
          <Dialog open={clearOpen} onOpenChange={setClearOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="size-4" />
                Limpar conversa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apagar toda a conversa?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Esta ação remove todo o histórico com o assistente e não pode ser desfeita.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClearOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={() => clearChat.mutate()} disabled={clearChat.isPending}>
                  Apagar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="mx-auto flex h-[calc(100vh-11rem)] max-w-4xl flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-center gap-2 font-semibold">
                  <Sparkles className="size-4 text-primary" /> Como posso ajudar?
                </div>
                <p className="text-sm text-muted-foreground">
                  Peça relatórios, análises com tabelas e gráficos, ou alterações — por exemplo
                  “aumenta o preço do pão para 150”.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      className="h-auto justify-start whitespace-normal text-left text-sm"
                      onClick={() => submit(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="w-full max-w-[95%] rounded-2xl border bg-card px-4 py-3">
                  <AssistantReport content={m.content} />
                </div>
              </div>
            ),
          )}

          {send.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                A analisar os dados…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva o seu pedido…"
            rows={2}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <Button type="submit" size="icon" className="size-11" disabled={send.isPending || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
