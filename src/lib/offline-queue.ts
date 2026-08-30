export type QueuedSaleArgs = {
  p_items: { product_id: string; quantity: number; unit_price: number }[];
  p_customer_id?: string;
  p_discount: number;
  p_paid: number;
  p_payment_method: string;
  p_notes: string;
};

export type QueuedSale = {
  localId: string;
  createdAt: number;
  args: QueuedSaleArgs;
};

const KEY = "bk_offline_sales_queue";

export function getQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

export function addToQueue(args: QueuedSaleArgs) {
  const queue = getQueue();
  queue.push({ localId: crypto.randomUUID(), createdAt: Date.now(), args });
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function removeFromQueue(localId: string) {
  const queue = getQueue().filter((q) => q.localId !== localId);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function queueCount() {
  return getQueue().length;
}
