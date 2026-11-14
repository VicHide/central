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
  const leftContext = typeof body.leftContext === "string" ? body.leftContext.trim().slice(0, 3000) : "";
  const rightContext = typeof body.rightContext === "string" ? body.rightContext.trim().slice(0, 3000) : "";
  if (!title || !leftLabel || !rightLabel) {
    return Response.json({ erro: "Informe o tema e os nomes dos dois quadros." }, { status: 400 });
  }

  const leftImage = mediaContent(body.leftMedia);
  const rightImage = mediaContent(body.rightMedia);
  if (!leftContext && !rightContext && !leftImage && !rightImage) {
    return Response.json({ erro: "Adicione imagens ou descreva os dois quadros para dar contexto ao roteiro." }, { status: 400 });
  }
  if ((body.leftMedia && !leftImage && !leftContext) || (body.rightMedia && !rightImage && !rightContext)) {
    return Response.json({ erro: "Para analisar vídeos, preencha o contexto adicional de cada quadro. A análise visual automática está disponível para imagens." }, { status: 400 });
  }

  const userContent: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: [
      `Tema do vídeo: ${title}`,
      `Quadro esquerdo: ${leftLabel}`,
      `Contexto do quadro esquerdo: ${leftContext || "Não informado; não deduza fatos apenas pela imagem."}`,
      `Quadro direito: ${rightLabel}`,
      `Contexto do quadro direito: ${rightContext || "Não informado; não deduza fatos apenas pela imagem."}`,
      "",
      "Crie um roteiro de comparação para um vídeo vertical de curiosidades e explicações sobre anime, em português brasileiro.",
      "REFERÊNCIA DE ESTILO: narração de vídeo curto (Shorts/TikTok) de anime, com linguagem jovem, direta e envolvente — como um criador que domina a obra conversando rápido com o público, sem formalidade excessiva.",
      "ESTRUTURA: produza de 6 a 8 cenas, com ritmo ágil e progressão clara. Comece com um gancho curto que prenda atenção; explique o primeiro conceito de forma direta; explique o segundo; faça uma comparação objetiva; destaque um detalhe ou diferença-chave e feche com uma conclusão rápida ou pergunta natural.",
      "CONTEÚDO: foque apenas no que mais diferencia os dois lados (funcionamento, vantagem, limitação ou consequência real na obra), quando houver base factual. Não enrole nem faça lista mecânica.",
      "PROFUNDIDADE E TAMANHO: seja sucinto! Mire de 130 a 180 palavras de narração no total (vídeo rápido de ~45 a 55 segundos). Cada cena deve ter de 15 a 26 palavras; abertura e fechamento podem ser ainda mais curtos. Corte qualquer enchimento.",
      "RITMO: escreva falas naturais e faladas (nada de texto engessado ou acadêmico), com frases curtas e diretas. Não use tópicos, títulos falados, instruções de câmera, marcações de palco, emojis ou clichês como 'você não vai acreditar'.",
      "PRECISÃO: não invente fatos, nomes, feitos, relações ou classificações. Não trate interpretação de fã como cânone. Se uma informação for controversa ou não estiver suficientemente estabelecida, omita-a ou formule a ressalva com clareza. A imagem serve para reconhecer o conteúdo visual, não para comprovar fatos da história.",
      "FOCO VISUAL: use active='left' quando a fala explicar o quadro esquerdo, active='right' quando explicar o direito e active='none' quando comparar ou contextualizar os dois. Alterne o foco de forma coerente, sem deixar todos os quadros ativos sem motivo.",
      "EXPRESSÃO: use 'surprise' apenas em uma revelação genuína e 'doubt' quando a fala levantar uma dúvida ou pergunta; caso contrário use 'neutral'.",
      "Não force equivalência: se um lado exigir mais explicação, distribua mais cenas para ele, mas mantenha a comparação equilibrada e clara.",
      "Retorne somente o JSON no formato solicitado.",
    ].join("\n"),
  }];
  if (leftImage) userContent.push(leftImage);
  if (rightImage) userContent.push(rightImage);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      scenes: {
        type: "array",
        minItems: 6,
        maxItems: 8,
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
        { role: "system", content: "Você é roteirista especializado em vídeos explicativos de anime para redes sociais. Sua prioridade é entregar informação interessante, progressão narrativa e precisão factual. Não escreva um resumo superficial nem uma sequência de frases genéricas. Responda apenas no formato estruturado solicitado." },
        { role: "user", content: userContent },
      ],
      text: { format: { type: "json_schema", name: "comparison_script", strict: true, schema } },
      max_output_tokens: 3000,
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
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 6 || parsed.scenes.length > 8) throw new Error("invalid scenes");
    return Response.json(parsed);
  } catch {
    return Response.json({ erro: "A resposta da IA veio em um formato inesperado. Tente novamente." }, { status: 502 });
  }
}
