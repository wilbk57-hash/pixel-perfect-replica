// Registo local de eventos da PWA (atualizações, recuperações de cache,
// registo do service worker). Guardado em localStorage para sobreviver a
// recarregamentos — é o que permite ver, depois de um reload automático,
// que uma atualização remota foi detetada e tratada.

export type PwaEvent = {
  at: number;
  type:
    | "sw_registered"
    | "sw_register_failed"
    | "stale_build_recovered"
    | "sw_unregistered_dev"
    | "caches_cleared";
  details?: string;
};

const KEY = "bk_pwa_events_v1";
const MAX = 50;

export function logPwaEvent(type: PwaEvent["type"], details?: string) {
  try {
    const events = getPwaEvents();
    events.unshift(details === undefined ? { at: Date.now(), type } : { at: Date.now(), type, details });
    localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
  } catch {
    // localStorage indisponível — ignora
  }
}

export function getPwaEvents(): PwaEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PwaEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearPwaEvents() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}

export const PWA_EVENT_LABELS: Record<PwaEvent["type"], string> = {
  sw_registered: "Service worker registado",
  sw_register_failed: "Falha ao registar service worker",
  stale_build_recovered: "Atualização remota detetada — cache limpa e página recarregada",
  sw_unregistered_dev: "Service worker removido (modo dev/preview)",
  caches_cleared: "Caches da aplicação limpas",
};
