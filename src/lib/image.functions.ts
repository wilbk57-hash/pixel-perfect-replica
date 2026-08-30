import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type GenerateImageInput = { productId: string; name: string; description?: string };

function buildPrompt(name: string, description?: string) {
  const extra = description?.trim() ? `, ${description.trim()}` : "";
  return (
    `Professional commercial product photography of "${name}"${extra}. ` +
    `If it is a food or beverage product, show it inside a realistic container appropriate ` +
    `for that product (glass bottle, jar, box or package), surrounded by the fresh raw ` +
    `ingredients naturally used to make it, arranged elegantly around the container. ` +
    `Studio softbox lighting, shallow depth of field, clean neutral background, sharp focus, ` +
    `ultra realistic, 4k, high-end e-commerce photography, no text, no watermark, no logo.`
  );
}

export const generateProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateImageInput) => {
    if (!input?.productId) throw new Error("Produto inválido");
    if (!input?.name?.trim()) throw new Error("Nome do produto em falta");
    return {
      productId: input.productId,
      name: input.name.trim(),
      description: input.description ?? "",
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviço de IA indisponível. Tente novamente mais tarde.");

    const prompt = buildPrompt(data.name, data.description);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) throw new Error("Limite de pedidos atingido. Tente novamente daqui a pouco.");
      if (aiRes.status === 402) throw new Error("Créditos de IA esgotados. Recarregue para continuar.");
      throw new Error(`Falha ao gerar imagem: ${aiRes.status} ${errText.slice(0, 200)}`);
    }

    const aiJson = (await aiRes.json()) as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    };
    const dataUrl = aiJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("A IA não devolveu nenhuma imagem.");

    const base64 = dataUrl.split(",")[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const path = `${userId}/${data.productId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(path);
    const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("products")
      .update({ image_url: publicUrl })
      .eq("id", data.productId);
    if (updateError) throw new Error(updateError.message);

    return { imageUrl: publicUrl };
  });
