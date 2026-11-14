export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { erro: "Configure OPENAI_API_KEY no arquivo .env.local e reinicie o painel." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const context = typeof body.context === "string" ? body.context.trim().slice(0, 3000) : "";

  if (!title) {
    return Response.json({ erro: "Informe o tema do Short." }, { status: 400 });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      hookTop: { type: "string" },
      hookBottom: { type: "string" },
      scenes: {
        type: "array",
        minItems: 6,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            speech: { type: "string" },
          },
          required: ["speech"],
        },
      },
    },
    required: ["hookTop", "hookBottom", "scenes"],
  };

  const prompt = [
    `Tema do Short: ${title}`,
    `Contexto adicional: ${context || "Não informado."}`,
    "",
    "Crie um roteiro para um YouTube Short / TikTok narrado de anime em português brasileiro, com ritmo rápido e linguagem jovem.",
    "ESTILO: frases curtas, diretas e envolventes (15 a 25 palavras por cena, 120 a 170 palavras no total).",
    "GANCHO VISUAL: preencha hookTop e hookBottom com 2 a 3 palavras impactantes em CAIXA ALTA cada (ex.: hookTop='NUNCA VAI', hookBottom='SER CAPITÃO') para aparecerem na primeira cena.",
    "ESTRUTURA: 6 a 8 cenas. Cena 1 = gancho rápido; cenas seguintes = explicação direta com fatos reais da obra; última cena = conclusão rápida ou pergunta para comentários.",
    "PRECISÃO: não invente fatos. Evite clichês artificiais ou marcações de câmera.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-6-luna",
      input: [
        { role: "system", content: "Você é roteirista de Shorts de anime com linguagem jovem, direta e precisa." },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_schema", name: "story_short_script", strict: true, schema } },
      max_output_tokens: 2000,
    }),
  }).catch(() => null);

  if (!response) return Response.json({ erro: "Não foi possível conectar à API de roteiro." }, { status: 502 });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result?.error?.message;
    return Response.json({ erro: typeof detail === "string" ? detail : "A API recusou a solicitação." }, { status: response.status });
  }

  const outputText = Array.isArray(result.output)
    ? result.output
        .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
        .find((item: { type?: string }) => item.type === "output_text")?.text
    : undefined;

  if (typeof outputText !== "string") {
    return Response.json({ erro: "A IA não retornou um roteiro válido." }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(outputText) as {
      hookTop: string;
      hookBottom: string;
      scenes: Array<{ speech: string }>;
    };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 6) throw new Error("invalid");
    return Response.json(parsed);
  } catch {
    return Response.json({ erro: "Resposta inesperada da IA. Tente novamente." }, { status: 502 });
  }
}
