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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) throw new Error("Limite de pedidos atingido. Tente novamente daqui a pouco.");
      if (aiRes.status === 402) throw new Error("Créditos de IA esgotados. Recarregue para continuar.");
      throw new Error(`Falha ao gerar imagem: ${aiRes.status} ${errText.slice(0, 200)}`);
    }

    const aiJson = (await aiRes.json()) as { data?: Array<{ b64_json?: string }> };
    const base64 = aiJson.data?.[0]?.b64_json;
    if (!base64) throw new Error("A IA não devolveu nenhuma imagem.");

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const path = `${userId}/${data.productId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signError } = await supabase.storage
      .from("product-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signError || !signed?.signedUrl) throw new Error(signError?.message ?? "Falha ao obter a imagem.");
    const publicUrl = `${signed.signedUrl}&v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("products")
      .update({ image_url: publicUrl })
      .eq("id", data.productId);
    if (updateError) throw new Error(updateError.message);

    return { imageUrl: publicUrl };
  });
