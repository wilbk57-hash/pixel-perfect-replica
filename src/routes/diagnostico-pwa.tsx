import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueue, usePendingQueue } from "@/lib/offline-queue";
import { clearPwaEvents, getPwaEvents, PWA_EVENT_LABELS, type PwaEvent } from "@/lib/pwa-events";

export const Route = createFileRoute("/diagnostico-pwa")({
  head: () => ({
    meta: [
      { title: "Diagnóstico PWA — BK BUSINESS" },
      {
        name: "description",
        content: "Estado do service worker, ligação online/offline e histórico de atualizações da aplicação.",
      },
      { property: "og:title", content: "Diagnóstico PWA — BK BUSINESS" },
      {
        property: "og:description",
        content: "Estado do service worker, ligação online/offline e histórico de atualizações da aplicação.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosticoPwaPage,
});

type SwInfo = {
  scriptURL: string;
  state: string;
  scope: string;
};

function useServiceWorkerInfo() {
  const [supported] = useState(() => typeof navigator !== "undefined" && "serviceWorker" in navigator);
  const [workers, setWorkers] = useState<SwInfo[]>([]);
  const [caches, setCaches] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  async function refresh() {
    if (!supported) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    setWorkers(
      regs.flatMap((r) =>
        [r.installing, r.waiting, r.active]
          .filter((w): w is ServiceWorker => w !== null)
          .map((w) => ({ scriptURL: w.scriptURL, state: w.state, scope: r.scope })),
      ),
    );
    if (window.caches) setCaches(await caches.keys());
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkUpdate() {
    setChecking(true);
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
    } finally {
      await refresh();
      setChecking(false);
    }
  }

  return { supported, workers, caches, refresh, checkUpdate, checking };
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function DiagnosticoPwaPage() {
  const sw = useServiceWorkerInfo();
  const online = useOnline();
  const queue = usePendingQueue();
  const [events, setEvents] = useState<PwaEvent[]>(() => getPwaEvents());

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  return (
    <AppShell title="Diagnóstico PWA" subtitle="Estado da instalação, service worker e sincronização offline">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Service worker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Suporte no navegador</span>
              <Badge variant={sw.supported ? "default" : "destructive"}>
                {sw.supported ? "Suportado" : "Não suportado"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Modo da app</span>
              <Badge variant={standalone ? "default" : "secondary"}>
                {standalone ? "Instalada (standalone)" : "Separador do navegador"}
              </Badge>
            </div>
            {sw.workers.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhum service worker ativo. Na pré-visualização do editor isto é esperado — o worker só é
                registado na app publicada.
              </p>
            ) : (
              <ul className="space-y-2">
                {sw.workers.map((w, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <p className="break-all font-mono text-xs">{w.scriptURL}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {w.state}
                      </Badge>
                      <span className="break-all text-xs text-muted-foreground">{w.scope}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <p className="mb-1 text-muted-foreground">Caches guardadas ({sw.caches.length})</p>
              {sw.caches.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma.</p>
              ) : (
                <ul className="space-y-1 font-mono text-xs">
                  {sw.caches.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => sw.refresh()}>
                <RefreshCw className="size-3.5" /> Atualizar estado
              </Button>
              <Button variant="outline" size="sm" onClick={() => sw.checkUpdate()} disabled={sw.checking}>
                {sw.checking ? "A verificar…" : "Verificar atualização do SW"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />} Ligação e fila offline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estado da ligação</span>
              <Badge variant={online ? "default" : "destructive"}>{online ? "Online" : "Offline"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Registos por sincronizar</span>
              <Badge variant={queue.length ? "secondary" : "outline"}>{queue.length}</Badge>
            </div>
            {queue.length > 0 && (
              <ul className="space-y-2">
                {queue.map((q) => (
                  <li key={q.localId} className="rounded-lg border p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{q.label}</span>
                      <span className="text-muted-foreground">{new Date(q.createdAt).toLocaleString("pt-PT")}</span>
                    </div>
                    {q.lastError ? <p className="mt-1 text-destructive">Último erro: {q.lastError}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              A fila sincroniza sozinha quando a ligação volta; também pode usar o botão "Sincronizar" no topo.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Histórico de atualizações</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEvents(getPwaEvents())}>
                  <RefreshCw className="size-3.5" /> Recarregar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearPwaEvents();
                    setEvents([]);
                  }}
                >
                  <Trash2 className="size-3.5" /> Limpar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {events.length === 0 ? (
              <p className="text-muted-foreground">
                Sem eventos registados ainda. Registos aparecem quando a app deteta uma nova versão e limpa a
                cache automaticamente, ou quando o service worker é registado/removido.
              </p>
            ) : (
              <ul className="divide-y">
                {events.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{PWA_EVENT_LABELS[e.type] ?? e.type}</p>
                      {e.details ? <p className="text-xs text-muted-foreground">{e.details}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.at).toLocaleString("pt-PT")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Fila offline atual (visão rápida): {getQueue().length} registo(s).
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
