import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

type Side = "left" | "right" | "none";
type Expression = "neutral" | "doubt" | "surprise";

function mediaContent(relative: unknown) {
  if (typeof relative !== "string" || !/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(relative)) return null;
  const root = path.resolve(process.cwd(), "public", "comparacoes");
  const file = path.resolve(process.cwd(), "public", relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".jpg" ? "image/jpeg" : ext === ".png" ? "image/png" : "image/webp";
  const data = fs.readFileSync(file);
  if (data.length > 8 * 1024 * 1024) return null;
  return { type: "input_image", image_url: `data:${mime};base64,${data.toString("base64")}`, detail: "high" };
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ erro: "Configure OPENAI_API_KEY no arquivo .env.local e reinicie o painel." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const leftLabel = typeof body.leftLabel === "string" ? body.leftLabel.trim().slice(0, 80) : "";
  const rightLabel = typeof body.rightLabel === "string" ? body.rightLabel.trim().slice(0, 80) : "";
  const leftContext = typeof body.leftContext === "string" ? body.leftContext.trim().slice(0, 1800) : "";
  const rightContext = typeof body.rightContext === "string" ? body.rightContext.trim().slice(0, 1800) : "";
  if (!title || !leftLabel || !rightLabel) {
    return Response.json({ erro: "Informe o tema e os nomes dos dois quadros." }, { status: 400 });
  }
  const leftImage = mediaContent(body.leftMedia);
  const rightImage = mediaContent(body.rightMedia);
  if (!leftContext && !rightContext && !leftImage && !rightImage) {
    return Response.json({ erro: "Adicione imagens ou descreva os dois quadros para dar contexto ao roteiro." }, { status: 400 });
  }
  if (body.leftMedia && !leftImage && !leftContext || body.rightMedia && !rightImage && !rightContext) {
    return Response.json({ erro: "Para analisar vídeos, preencha o contexto adicional de cada quadro. A análise visual automática está disponível para imagens." }, { status: 400 });
  }

  const userContent: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: [
      `Tema do vídeo: ${title}`,
      `Quadro esquerdo: ${leftLabel}`,
      `Contexto do quadro esquerdo: ${leftContext || "Não informado; use somente o que for possível observar na imagem, se houver."}`,
      `Quadro direito: ${rightLabel}`,
      `Contexto do quadro direito: ${rightContext || "Não informado; use somente o que for possível observar na imagem, se houver."}`,
      "Crie um roteiro de comparação para um vídeo vertical curto, em português brasileiro.",
      "A narração deve soar como um apresentador de conteúdo de anime: animada, expressiva, natural e sem exagero artificial.",
      "Use exatamente 5 cenas: abertura; explicação do quadro esquerdo; explicação do quadro direito; comparação direta; pergunta final.",
      "Cada fala deve ser curta, própria para voz em off, sem marcações de palco, sem emojis e sem afirmações factuais não sustentadas pelo contexto.",
      "Não invente detalhes do anime. Se faltar informação, mantenha a fala descritiva ou sinalize a lacuna de forma natural.",
      "A cena da esquerda deve usar active='left', a da direita active='right'; abertura, comparação e pergunta final usam active='none'.",
      "A última cena deve usar expression='doubt'.",
    ].join("\n"),
  }];
  if (leftImage) userContent.push({ ...leftImage, type: "input_image" });
  if (rightImage) userContent.push({ ...rightImage, type: "input_image" });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      scenes: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            active: { type: "string", enum: ["left", "right", "none"] },
            speech: { type: "string" },
            expression: { type: "string", enum: ["neutral", "doubt", "surprise"] },
          },
          required: ["label", "active", "speech", "expression"],
        },
      },
    },
    required: ["title", "scenes"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-6-luna",
      input: [
        { role: "system", content: "Você é roteirista e editor de vídeos curtos sobre anime. Escreva falas objetivas, interessantes e factualmente cuidadosas. Responda apenas no formato estruturado solicitado." },
        { role: "user", content: userContent },
      ],
      text: { format: { type: "json_schema", name: "comparison_script", strict: true, schema } },
      max_output_tokens: 1200,
    }),
  }).catch(() => null);

  if (!response) return Response.json({ erro: "Não foi possível conectar à API de geração de roteiro." }, { status: 502 });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result?.error?.message;
    return Response.json({ erro: typeof detail === "string" ? detail : "A API de roteiro recusou a solicitação." }, { status: response.status });
  }

  const outputText = Array.isArray(result.output)
    ? result.output.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
        .find((item: { type?: string }) => item.type === "output_text")?.text
    : undefined;
  if (typeof outputText !== "string") {
    return Response.json({ erro: "A IA não retornou um roteiro válido. Tente novamente." }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(outputText) as { title: string; scenes: Array<{ label: string; active: Side; speech: string; expression: Expression }> };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== 5) throw new Error("invalid scenes");
    return Response.json(parsed);
  } catch {
    return Response.json({ erro: "A resposta da IA veio em um formato inesperado. Tente novamente." }, { status: 502 });
  }
}
