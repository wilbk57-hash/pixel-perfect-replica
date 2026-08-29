import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

type AssistantInput = { messages: Array<{ role: "user" | "assistant"; content: string }> };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_snapshot",
      description:
        "Obtém um retrato completo do negócio: produtos, estoque, clientes, dívidas, resumo de vendas e a evolução diária de vendas/lucro dos últimos 30 dias. Use sempre antes de responder a perguntas de análise.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sales",
      description: "Lista as vendas dos últimos N dias com itens vendidos.",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Número de dias para trás (1-365)" } },
        required: ["days"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_product",
      description: "Atualiza campos de um produto existente (preços, stock mínimo, nome, estado).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          name: { type: "string" },
          sale_price: { type: "number" },
          cost_price: { type: "number" },
          min_stock: { type: "number" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
        },
        required: ["product_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description: "Cria um novo produto.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          unit: { type: "string" },
          sale_price: { type: "number" },
          cost_price: { type: "number" },
          current_stock: { type: "number" },
          min_stock: { type: "number" },
          product_type: { type: "string", enum: ["FINISHED", "RAW_MATERIAL", "PACKAGING"] },
        },
        required: ["name", "sale_price"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_stock",
      description: "Ajusta o estoque de um produto (entrada positiva, saída negativa).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "number" },
          type: { type: "string", enum: ["PURCHASE", "ADJUSTMENT", "RETURN", "LOSS"] },
          reason: { type: "string" },
        },
        required: ["product_id", "quantity", "type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_customer",
      description: "Atualiza dados de um cliente (telefone, limite de crédito, notas, estado).",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          name: { type: "string" },
          phone: { type: "string" },
          credit_limit: { type: "number" },
          notes: { type: "string" },
          is_active: { type: "boolean" },
        },
        required: ["customer_id"],
        additionalProperties: false,
      },
    },
  },
] as const;

const WRITE_TOOLS = new Set(["update_product", "create_product", "adjust_stock", "update_customer"]);

const SYSTEM_PROMPT_BASE = [
  "És o assistente do BK BUSINESS, um sistema de gestão de negócio (PDV, estoque, produção, clientes e dívidas).",
  "Responde SEMPRE em português de Portugal, com relatórios claros, bem estruturados e fáceis de ler rapidamente.",
  "A moeda é FCFA (XOF). Formata sempre valores monetários com separador de milhares, ex.: 12.500 FCFA.",
  "Antes de analisar ou responder sobre dados, chama a ferramenta get_snapshot (usa list_sales quando precisares de detalhe item a item por período).",
  "",
  "REGRAS DE FORMATAÇÃO (Markdown):",
  "- Começa cada relatório com um título curto em ## .",
  "- Usa **negrito** só para destacar números-chave ou conclusões, sem exagerar.",
  "- Sempre que houver 3 ou mais itens comparáveis (produtos, clientes, vendas, dívidas), apresenta-os numa tabela Markdown (GFM) com cabeçalho claro — nunca como lista corrida de números.",
  "- Sempre que ajudar a perceber uma tendência, evolução ou distribuição (vendas ao longo do tempo, produtos mais vendidos, dívidas por cliente), insere um bloco de código com a linguagem 'chart' contendo APENAS um JSON válido, sem texto à volta, neste formato:",
  '  {"type":"bar|line|pie","title":"Título curto","xKey":"campo_do_eixo_x","data":[{"campo_do_eixo_x":"...","serie1":123}],"series":[{"key":"serie1","label":"Nome legível"}]}',
  "  Para 'pie', cada item de 'data' deve ter um campo de nome (usa xKey a apontar para ele) e um campo 'value'.",
  "  Usa 'line' para evolução no tempo, 'bar' para comparar categorias, 'pie' para proporções de um total.",
  "- Não repitas a mesma informação em texto, tabela e gráfico ao mesmo tempo — escolhe o formato mais claro para cada dado e complementa com uma frase curta de interpretação.",
  "- Termina relatórios com mais de um bloco de dados com uma secção final '### Conclusão' com 1-2 frases objetivas de recomendação prática.",
  "",
  "Nunca inventes dados que não vieram das ferramentas.",
].join("\n");

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AssistantInput) => {
    if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
      throw new Error("Mensagem inválida");
    }
    return { messages: input.messages.slice(-12) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Assistente indisponível: chave de IA em falta.");

    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "dono" });
    const canEdit = isOwner === true;

    async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      if (WRITE_TOOLS.has(name) && !canEdit) {
        return { error: "Sem permissão: apenas o dono pode alterar dados." };
      }

      if (name === "get_snapshot") {
        const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const [products, customers, debts, sales, salesTrendRaw] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, unit, sale_price, cost_price, current_stock, min_stock, product_type, status"),
          supabase.from("customers").select("id, name, phone, current_debt, total_spent, credit_limit, is_active"),
          supabase
            .from("customer_debts")
            .select("id, customer_name, remaining_amount, original_amount, status, created_at")
            .neq("status", "PAID"),
          supabase
            .from("sales")
            .select("sale_number, customer_name, final_total, gross_profit, payment_status, created_at")
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("sales")
            .select("final_total, gross_profit, created_at")
            .gte("created_at", since30)
            .order("created_at", { ascending: true }),
        ]);

        const trendMap = new Map<string, { total: number; lucro: number }>();
        for (const row of salesTrendRaw.data ?? []) {
          const day = new Date(row.created_at as string).toISOString().slice(0, 10);
          const entry = trendMap.get(day) ?? { total: 0, lucro: 0 };
          entry.total += Number(row.final_total) || 0;
          entry.lucro += Number(row.gross_profit) || 0;
          trendMap.set(day, entry);
        }
        const vendas_por_dia_ultimos_30_dias = Array.from(trendMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dia, v]) => ({ dia, total: Math.round(v.total), lucro: Math.round(v.lucro) }));

        return {
          moeda: "FCFA",
          data_actual: new Date().toISOString(),
          produtos: products.data ?? [],
          clientes: customers.data ?? [],
          dividas_em_aberto: debts.data ?? [],
          ultimas_vendas: sales.data ?? [],
          vendas_por_dia_ultimos_30_dias,
        };
      }

      if (name === "list_sales") {
        const days = Math.min(Math.max(Number(args["days"]) || 7, 1), 365);
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { data: rows, error } = await supabase
          .from("sale_items")
          .select("product_name, quantity, unit_price, subtotal, profit, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return { error: error.message };
        return { desde: since, itens: rows ?? [] };
      }

      if (name === "update_product") {
        const patch: {
          name?: string;
          sale_price?: number;
          cost_price?: number;
          min_stock?: number;
          status?: string;
        } = {};
        if (args["name"] !== undefined) patch.name = String(args["name"]);
        if (args["sale_price"] !== undefined) patch.sale_price = Number(args["sale_price"]);
        if (args["cost_price"] !== undefined) patch.cost_price = Number(args["cost_price"]);
        if (args["min_stock"] !== undefined) patch.min_stock = Number(args["min_stock"]);
        if (args["status"] !== undefined) patch.status = String(args["status"]);
        if (Object.keys(patch).length === 0) return { error: "Nada para atualizar." };

        const { data: row, error } = await supabase
          .from("products")
          .update(patch)
          .eq("id", String(args["product_id"]))
          .select("id, name, sale_price, cost_price, min_stock, status")
          .maybeSingle();
        if (error) return { error: error.message };
        return { ok: true, produto: row };
      }

      if (name === "create_product") {
        const { data: row, error } = await supabase
          .from("products")
          .insert({
            user_id: userId,
            name: String(args["name"]),
            unit: String(args["unit"] ?? "UN"),
            sale_price: Number(args["sale_price"] ?? 0),
            cost_price: Number(args["cost_price"] ?? 0),
            current_stock: Number(args["current_stock"] ?? 0),
            min_stock: Number(args["min_stock"] ?? 0),
            product_type: String(args["product_type"] ?? "FINISHED"),
          })
          .select("id, name, sale_price")
          .maybeSingle();
        if (error) return { error: error.message };
        return { ok: true, produto: row };
      }

      if (name === "adjust_stock") {
        const { error } = await supabase.rpc("adjust_stock", {
          p_product_id: String(args["product_id"]),
          p_quantity: Number(args["quantity"]),
          p_type: String(args["type"]),
          p_reason: String(args["reason"] ?? "Ajuste pelo assistente"),
        });
        if (error) return { error: error.message };
        return { ok: true };
      }

      if (name === "update_customer") {
        const patch: {
          name?: string;
          phone?: string;
          credit_limit?: number;
          notes?: string;
          is_active?: boolean;
        } = {};
        if (args["name"] !== undefined) patch.name = String(args["name"]);
        if (args["phone"] !== undefined) patch.phone = String(args["phone"]);
        if (args["credit_limit"] !== undefined) patch.credit_limit = Number(args["credit_limit"]);
        if (args["notes"] !== undefined) patch.notes = String(args["notes"]);
        if (args["is_active"] !== undefined) patch.is_active = Boolean(args["is_active"]);
        if (Object.keys(patch).length === 0) return { error: "Nada para atualizar." };

        const { data: row, error } = await supabase
          .from("customers")
          .update(patch)
          .eq("id", String(args["customer_id"]))
          .select("id, name, phone, credit_limit, is_active")
          .maybeSingle();
        if (error) return { error: error.message };
        return { ok: true, cliente: row };
      }

      return { error: `Ferramenta desconhecida: ${name}` };
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          SYSTEM_PROMPT_BASE,
          canEdit
            ? "Podes alterar dados quando o utilizador pedir claramente. Confirma no fim o que alteraste."
            : "Este utilizador é funcionário: NÃO podes alterar dados nem revelar lucros, custos ou margens. Nesse caso explica que só o dono tem acesso.",
        ].join("\n"),
      },
      ...data.messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];

    for (let i = 0; i < 6; i++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3.7-flash", messages, tools: TOOLS }),
      });

      if (res.status === 429) return { reply: "Muitos pedidos ao assistente. Tente novamente daqui a pouco." };
      if (res.status === 402) return { reply: "Créditos de IA esgotados. Recarregue para continuar a usar o assistente." };
      if (!res.ok) {
        console.error("AI gateway error", res.status, await res.text());
        throw new Error("O assistente falhou. Tente novamente.");
      }

      const payload = (await res.json()) as {
        choices?: Array<{ message?: ChatMessage }>;
      };
      const msg = payload.choices?.[0]?.message;
      if (!msg) throw new Error("Resposta vazia do assistente.");

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg);
        for (const call of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 40000),
          });
        }
        continue;
      }

      return { reply: msg.content ?? "" };
    }

    return { reply: "Não consegui concluir a análise. Reformule o pedido." };
  });
