import { useEffect, useState } from "react";

// ============================================================
// Tipos de ação que podem ser registados offline e sincronizados depois.
// ============================================================

export type ActionKind =
  | "sale"
  | "pay_debt"
  | "adjust_stock"
  | "produce_recipe"
  | "product_upsert"
  | "category_insert"
  | "customer_upsert";

export type SalePayload = {
  p_items: { product_id: string; quantity: number; unit_price: number }[];
  p_customer_id?: string;
  p_discount: number;
  p_paid: number;
  p_payment_method: string;
  p_notes: string;
};

export type PayDebtPayload = {
  p_debt_id: string;
  p_amount: number;
  p_method: string;
  p_notes: string;
};

export type AdjustStockPayload = {
  p_product_id: string;
  p_quantity: number;
  p_type: string;
  p_reason: string;
};

export type ProduceRecipePayload = {
  p_recipe_id: string;
  p_batches: number;
};

export type ProductUpsertPayload = {
  id?: string;
  user_id: string;
  name: string;
  category_id: string | null;
  description: string;
  unit: string;
  product_type: string;
  sale_price: number;
  cost_price: number;
  min_stock: number;
  sku: string;
  current_stock?: number;
};

export type CategoryInsertPayload = {
  user_id: string;
  name: string;
};

export type CustomerUpsertPayload = {
  id?: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  credit_limit: number;
};

export type QueuedAction =
  | { localId: string; createdAt: number; kind: "sale"; payload: SalePayload; label: string }
  | { localId: string; createdAt: number; kind: "pay_debt"; payload: PayDebtPayload; label: string }
  | { localId: string; createdAt: number; kind: "adjust_stock"; payload: AdjustStockPayload; label: string }
  | { localId: string; createdAt: number; kind: "produce_recipe"; payload: ProduceRecipePayload; label: string }
  | { localId: string; createdAt: number; kind: "product_upsert"; payload: ProductUpsertPayload; label: string }
  | { localId: string; createdAt: number; kind: "category_insert"; payload: CategoryInsertPayload; label: string }
  | { localId: string; createdAt: number; kind: "customer_upsert"; payload: CustomerUpsertPayload; label: string };

const KEY = "bk_offline_queue_v2";
const LEGACY_KEY = "bk_offline_sales_queue";

// Migra silenciosamente a fila antiga (só vendas) para o novo formato.
function migrateLegacy(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const old = JSON.parse(raw) as { localId: string; createdAt: number; args: SalePayload }[];
    localStorage.removeItem(LEGACY_KEY);
    return old.map((o) => ({
      localId: o.localId,
      createdAt: o.createdAt,
      kind: "sale" as const,
      payload: o.args,
      label: "Venda",
    }));
  } catch {
    return [];
  }
}

export function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    const current = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
    const legacy = migrateLegacy();
    if (legacy.length) {
      const merged = [...current, ...legacy];
      localStorage.setItem(KEY, JSON.stringify(merged));
      return merged;
    }
    return current;
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedAction[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function addToQueue(kind: ActionKind, payload: unknown, label: string) {
  const queue = getQueue();
  const localId = crypto.randomUUID();
  queue.push({ localId, createdAt: Date.now(), kind, payload, label } as QueuedAction);
  saveQueue(queue);
  return localId;
}

export function removeFromQueue(localId: string) {
  saveQueue(getQueue().filter((q) => q.localId !== localId));
}

export function queueCount() {
  return getQueue().length;
}

export function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function looksLikeOfflineError(e: unknown) {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch") || isOffline();
}

/**
 * Corre `run`. Se o aparelho estiver offline (ou a chamada falhar por motivo de rede),
 * guarda a ação na fila local em vez de propagar o erro.
 */
export async function runOrQueue<T>(
  kind: ActionKind,
  payload: unknown,
  label: string,
  run: () => Promise<T>,
): Promise<{ offline: boolean; result?: T }> {
  if (isOffline()) {
    addToQueue(kind, payload, label);
    return { offline: true };
  }
  try {
    const result = await run();
    return { offline: false, result };
  } catch (e) {
    if (looksLikeOfflineError(e)) {
      addToQueue(kind, payload, label);
      return { offline: true };
    }
    throw e;
  }
}

/** Hook: devolve as ações em fila (opcionalmente filtradas por tipo), atualizado automaticamente. */
export function usePendingQueue<K extends ActionKind = ActionKind>(kind?: K) {
  const [items, setItems] = useState<QueuedAction[]>([]);

  useEffect(() => {
    const update = () => {
      const q = getQueue();
      setItems(kind ? q.filter((i) => i.kind === kind) : q);
    };
    update();
    const interval = setInterval(update, 2000);
    window.addEventListener("storage", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [kind]);

  return items as Extract<QueuedAction, { kind: K }>[];
}
