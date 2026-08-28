export function money(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(n)} FCFA`;
}

export function qty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n);
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const UNITS = ["UN", "KG", "G", "L", "ML", "PACOTE", "GARRAFA", "CAIXA"] as const;

export const PRODUCT_TYPES = [
  { value: "FINISHED", label: "Produto acabado" },
  { value: "RAW_MATERIAL", label: "Matéria-prima" },
  { value: "PACKAGING", label: "Embalagem" },
] as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Dinheiro" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "CREDIT", label: "Crédito (fiado)" },
  { value: "OTHER", label: "Outro" },
] as const;
