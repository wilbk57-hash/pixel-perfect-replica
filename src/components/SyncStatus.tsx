import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getQueue, removeFromQueue, queueCount } from "@/lib/offline-queue";

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

  async function sync() {
    setSyncing(true);
    const queue = getQueue();
    let ok = 0;
    let fail = 0;
    for (const item of queue) {
      const { error } = await supabase.rpc("create_sale", item.args as any);
      if (error) {
        fail++;
      } else {
        removeFromQueue(item.localId);
        ok++;
      }
    }
    setPending(queueCount());
    setSyncing(false);
    qc.invalidateQueries();
    if (ok > 0) toast.success(`${ok} venda(s) sincronizada(s)`);
    if (fail > 0) toast.error(`${fail} venda(s) não foi possível sincronizar — verifique o estoque`);
    if (ok === 0 && fail === 0) toast.message("Nada por sincronizar");
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`hidden items-center gap-1 text-xs sm:flex ${online ? "text-success" : "text-destructive"}`}>
        {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {online ? "Online" : "Offline"}
      </span>
      {pending > 0 && (
        <Button variant="outline" size="sm" onClick={sync} disabled={syncing || !online}>
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "A sincronizar…" : `Sincronizar (${pending})`}
        </Button>
      )}
    </div>
  );
}
