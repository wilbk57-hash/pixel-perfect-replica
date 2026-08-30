import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getQueue, removeFromQueue, queueCount, type QueuedAction } from "@/lib/offline-queue";

async function runAction(item: QueuedAction) {
  switch (item.kind) {
    case "sale": {
      const { error } = await supabase.rpc("create_sale", item.payload as any);
      if (error) throw error;
      return;
    }
    case "pay_debt": {
      const { error } = await supabase.rpc("pay_debt", item.payload as any);
      if (error) throw error;
      return;
    }
    case "adjust_stock": {
      const { error } = await supabase.rpc("adjust_stock", item.payload as any);
      if (error) throw error;
      return;
    }
    case "produce_recipe": {
      const { error } = await supabase.rpc("produce_recipe", item.payload as any);
      if (error) throw error;
      return;
    }
    case "product_upsert": {
      const { id, ...rest } = item.payload;
      if (id) {
        const { error } = await supabase.from("products").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(rest as any);
        if (error) throw error;
      }
      return;
    }
    case "category_insert": {
      const { error } = await supabase.from("categories").insert(item.payload as any);
      if (error) throw error;
      return;
    }
    case "customer_upsert": {
      const { id, ...rest } = item.payload;
      if (id) {
        const { error } = await supabase.from("customers").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(rest as any);
        if (error) throw error;
      }
      return;
    }
  }
}

export function SyncStatus() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => setPending(queueCount());
    update();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(update, 3000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, []);

  async function sync(opts?: { silent?: boolean }) {
    if (syncing) return;
    setSyncing(true);
    // Processa pela ordem em que foi criado; para no primeiro erro para não
    // saltar à frente de uma ação da qual outra possa depender.
    const queue = [...getQueue()].sort((a, b) => a.createdAt - b.createdAt);
    let ok = 0;
    let fail = 0;
    for (const item of queue) {
      try {
        await runAction(item);
        removeFromQueue(item.localId);
        ok++;
      } catch {
        fail++;
        break;
      }
    }
    setPending(queueCount());
    setSyncing(false);
    if (ok > 0 || fail > 0) qc.invalidateQueries();
    if (ok > 0) toast.success(`${ok} registo(s) sincronizado(s)`);
    if (fail > 0) toast.error(`${fail} registo(s) não sincronizado(s) — verifique os dados e tente novamente`);
    if (ok === 0 && fail === 0 && !opts?.silent) toast.message("Nada por sincronizar");
  }

  // Quando a ligação volta, tenta sincronizar sozinho (sem incomodar se não houver nada).
  useEffect(() => {
    if (online && queueCount() > 0) {
      sync({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <div className="flex items-center gap-2">
      <span className={`hidden items-center gap-1 text-xs sm:flex ${online ? "text-success" : "text-destructive"}`}>
        {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {online ? "Online" : "Offline"}
      </span>
      {pending > 0 && (
        <Button variant="outline" size="sm" onClick={() => sync()} disabled={syncing || !online}>
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "A sincronizar…" : `Sincronizar (${pending})`}
        </Button>
      )}
    </div>
  );
}
