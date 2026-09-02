import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ReminderInput = { debtId: string; message?: string };

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Guiné-Bissau (+245) por omissão quando o número vem sem indicativo.
  if (digits.length <= 9) return `245${digits}`;
  return digits;
}

export const sendDebtReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ReminderInput) => {
    if (!input?.debtId) throw new Error("Dívida inválida");
    return { debtId: input.debtId, message: (input.message ?? "").slice(0, 900) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: debt, error } = await supabase
      .from("customer_debts")
      .select("id, customer_id, customer_name, remaining_amount, sale_number")
      .eq("id", data.debtId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!debt) throw new Error("Dívida não encontrada");

    // Evita reenviar o mesmo lembrete para a mesma dívida em menos de 12h.
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("debt_reminders")
      .select("id, created_at")
      .eq("debt_id", debt.id)
      .eq("status", "SENT")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      const hoursAgo = Math.max(1, Math.round((Date.now() - new Date(recent.created_at).getTime()) / 3600000));
      return {
        sent: false,
        configured: true,
        waLink: "",
        message: "",
        error: `Já foi enviado um lembrete para esta dívida há ${hoursAgo}h. Aguarde 12h antes de reenviar.`,
      };
    }


    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("id", debt.customer_id)
      .maybeSingle();

    const phone = normalizePhone(customer?.phone ?? "");
    const amount = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(
      Number(debt.remaining_amount),
    );
    const message =
      data.message ||
      `Olá ${debt.customer_name}, lembrete amigável: tem um saldo em aberto de ${amount} FCFA${
        debt.sale_number ? ` referente à venda ${debt.sale_number}` : ""
      }. Agradecemos a regularização. — BK BUSINESS`;

    const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "";

    if (!phone) {
      return { sent: false, configured: true, waLink: "", message, error: "Cliente sem número de telefone." };
    }

    const token = process.env["WHATSAPP_TOKEN"];
    const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];

    if (!token || !phoneNumberId) {
      return {
        sent: false,
        configured: false,
        waLink,
        message,
        error: "WhatsApp API não configurada. Use o envio manual ou adicione as credenciais.",
      };
    }

    let sent = false;
    let providerId = "";
    let failure = "";

    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      });
      const payload = (await res.json()) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        failure = payload.error?.message ?? `Erro ${res.status} do WhatsApp`;
      } else {
        sent = true;
        providerId = payload.messages?.[0]?.id ?? "";
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "Falha de rede ao contactar o WhatsApp";
    }

    await supabase.from("debt_reminders").insert({
      user_id: userId,
      debt_id: debt.id,
      customer_id: debt.customer_id,
      customer_name: debt.customer_name,
      phone,
      message,
      status: sent ? "SENT" : "FAILED",
      error: failure,
      provider_message_id: providerId,
    });

    return { sent, configured: true, waLink, message, error: failure };
  });
