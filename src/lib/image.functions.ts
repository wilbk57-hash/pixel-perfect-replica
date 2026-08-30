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

    const falKey = process.env["FAL_KEY"];
    if (!falKey) {
      throw new Error(
        "FAL_KEY não configurada. Adicione a chave da fal.ai nas variáveis de ambiente do projeto.",
      );
    }

    const prompt = buildPrompt(data.name, data.description);

    const falRes = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: "square_hd",
        num_images: 1,
      }),
    });

    if (!falRes.ok) {
      const errText = await falRes.text().catch(() => "");
      throw new Error(`Falha ao gerar imagem (fal.ai): ${falRes.status} ${errText.slice(0, 200)}`);
    }

    const falJson = (await falRes.json()) as { images?: Array<{ url?: string }> };
    const imageUrl = falJson.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error("A fal.ai não devolveu nenhuma imagem.");
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("Não foi possível descarregar a imagem gerada.");
    const bytes = new Uint8Array(await imgRes.arrayBuffer());

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
