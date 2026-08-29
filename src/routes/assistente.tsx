import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AssistantReport } from "@/components/AssistantReport";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
  const ask = useServerFn(askAssistant);
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const next: Msg[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      const res = await ask({ data: { messages: next } });
      return res.reply;
    },
    onSuccess: (reply) => {
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      qc.invalidateQueries();
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
