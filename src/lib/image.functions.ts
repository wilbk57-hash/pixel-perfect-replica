import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type GenerateImageInput = {
  productId: string;
  name: string;
  description?: string;
  customInstructions?: string;
  packaging?: string;
};

const PACKAGING_PROMPTS: Record<string, string> = {
  glass_bottle: "Use exactly a transparent glass bottle as the container, showing the product/liquid clearly through the glass.",
  plastic_bottle: "Use exactly a plastic bottle (PET-style) as the container.",
  can: "Use exactly a metal can as the container.",
  jar: "Use exactly a glass jar with a lid as the container.",
  box: "Use exactly a cardboard or paperboard box/carton as the packaging.",
  none: "Do NOT use any bottle, can, jar or box. Show only the raw main ingredient itself, with no packaging or container at all.",
};

function buildPrompt(name: string, description?: string, customInstructions?: string, packaging?: string) {
  const extra = description?.trim() ? `, ${description.trim()}` : "";
  const packagingLine = packaging && PACKAGING_PROMPTS[packaging] ? ` ${PACKAGING_PROMPTS[packaging]}` : "";

  const base =
    `Ultra realistic professional commercial product photography of "${name}"${extra}. ` +
    `Identify the single main raw ingredient of this product and make it the clear visual hero of ` +
    `the frame, in sharp macro-like focus, with its natural texture, color and freshness fully visible.` +
    packagingLine +
    (packaging && packaging !== "none"
      ? " Place the main ingredient prominently beside or around the container."
      : "") +
    ` Studio softbox lighting from the top, shallow depth of field, clean neutral background. Compose ` +
    `with generous negative space and a subtly darker, softly shadowed tone in the bottom third of the ` +
    `frame, so text can be overlaid there later. Square 1:1 composition, ultra realistic, 4k, high-end ` +
    `e-commerce photography, no text, no watermark, no logo.`;

  if (!customInstructions?.trim()) return base;

  return (
    `${base} Additional specific instructions from the shop owner that MUST be followed and take ` +
    `priority over the general styling above whenever they conflict: "${customInstructions.trim()}".`
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
      customInstructions: input.customInstructions ?? "",
      packaging: input.packaging ?? "",
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviço de IA indisponível. Tente novamente mais tarde.");

    // Resolve o dono efetivo do negócio (o próprio, ou o dono a quem o
    // funcionário está associado), para guardar a imagem sempre na mesma
    // pasta do negócio — independentemente de quem gera a imagem.
    const { data: ownerId, error: ownerError } = await supabase.rpc("effective_owner_id");
    if (ownerError || !ownerId) throw new Error("Não foi possível identificar o negócio.");

    const prompt = buildPrompt(data.name, data.description, data.customInstructions, data.packaging);

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

    const path = `${ownerId}/${data.productId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("products")
      .update({ image_url: publicUrl })
      .eq("id", data.productId);
    if (updateError) throw new Error(updateError.message);

    return { imageUrl: publicUrl };
  });
