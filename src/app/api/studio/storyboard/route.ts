import https from "node:https";

export const dynamic = "force-dynamic";

type StoryboardScene = {
  index: number;
  title: string;
  speech: string;
  searchQuery: string;
  mediaKind: "image" | "video";
  motion: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
};

const MOTIONS: StoryboardScene["motion"][] = ["zoom-in", "pan-left", "zoom-out", "pan-right"];

function buildFallbackStoryboard(briefing: string, style: string, durationMin: number): {
  title: string;
  hookTop: string;
  hookBottom: string;
  scenes: StoryboardScene[];
} {
  const cleanBrief = briefing.trim() || "Momentos épicos de anime";
  const count = Math.max(4, Math.min(10, Math.round(durationMin <= 2 ? 5 : durationMin * 2)));
  const topicWords = cleanBrief.split(/\s+/).slice(0, 5).join(" ");

  const scenes: StoryboardScene[] = Array.from({ length: count }, (_, i) => {
    const idx = i + 1;
    const isHook = idx === 1;
    const isEnd = idx === count;
    const speech = isHook
      ? `Olha só o que aconteceu em ${topicWords} — quase ninguém reparou nesse detalhe logo de cara.`
      : isEnd
        ? `E aí, qual desses momentos de ${topicWords} você acha mais absurdo? Deixa nos comentários!`
        : `Na cena ${idx}, a disputa muda completamente de nível e mostra por que esse estilo ${style} prende tanta gente.`;
    return {
      index: idx,
      title: isHook ? "Gancho inicial" : isEnd ? "Fechamento e CTA" : `Cena ${idx} · Desenvolvimento`,
      speech,
      searchQuery: isHook ? `${topicWords} epic moment` : `${topicWords} scene ${idx} anime`,
      mediaKind: idx % 2 === 0 ? "video" : "image",
      motion: MOTIONS[i % MOTIONS.length],
    };
  });

  return {
    title: topicWords,
    hookTop: "VOCÊ VIU",
    hookBottom: "ISSO AQUI?",
    scenes,
  };
}

function postJsonIpv4(urlStr: string, payload: unknown, timeoutMs = 45_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        family: 4,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout após ${Math.round(timeoutMs / 1000)}s (IPv4)`));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function generateWithGemini(apiKey: string, prompt: string) {
  const candidatesList = Array.from(
    new Set([
      process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      "gemini-2.5-flash-lite",
      "gemini-flash-latest",
    ]),
  );

  let lastError = "Falha ao consultar Gemini API.";
  for (const model of candidatesList) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let rawRes: { status: number; body: string };
    try {
      rawRes = await postJsonIpv4(
        url,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.85,
          },
        },
        45_000,
      );
    } catch (err) {
      lastError = `Falha de conexão com a Gemini API: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawRes.body) as Record<string, unknown>;
    } catch {
      // segue com objeto vazio
    }
    if (rawRes.status < 200 || rawRes.status >= 300) {
      const errObj = data?.error as { message?: string } | undefined;
      lastError = errObj?.message || `Gemini retornou erro ${rawRes.status}`;
      if (rawRes.status === 503 || rawRes.status === 429 || rawRes.status === 404 || rawRes.status === 400) {
        continue;
      }
      return { ok: false as const, error: lastError };
    }
    const candidates = data?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const text = candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastError = "Gemini não retornou conteúdo.";
      continue;
    }
    const cleaned = String(text).trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    try {
      return { ok: true as const, parsed: JSON.parse(cleaned), model };
    } catch {
      lastError = "Gemini retornou JSON inválido.";
    }
  }
  return { ok: false as const, error: lastError };
}

export async function POST(req: Request) {
  try {
  const body = await req.json().catch(() => ({}));
  const briefing = typeof body?.briefing === "string" ? body.briefing.trim().slice(0, 3000) : "";
  const style = typeof body?.style === "string" ? body.style.trim() : "Anime Essay";
  const format = typeof body?.format === "string" ? body.format.trim() : "YouTube 16:9 (-14 LUFS)";
  const durationMin = Math.max(0.5, Math.min(20, Number(body?.durationMin) || 1));
  const humorPct = Math.max(0, Math.min(100, Number(body?.humorPct) ?? 35));
  const aiProvider: "auto" | "gemini" | "openai" =
    body?.aiProvider === "gemini" || body?.aiProvider === "openai" ? body.aiProvider : "auto";

  if (!briefing) {
    return Response.json({ erro: "Descreva o briefing do vídeo antes de gerar o storyboard." }, { status: 400 });
  }

  const targetScenes = Math.max(4, Math.min(14, Math.round(durationMin <= 2 ? 6 : durationMin * 2)));
  const prompt = [
    `Briefing do usuário: ${briefing}`,
    `Estilo/Gênero: ${style}`,
    `Formato: ${format}`,
    `Duração alvo: ${durationMin} minuto(s) (exatamente ${targetScenes} cenas)`,
    `Intensidade de humor: ${humorPct}%`,
    "",
    "Você é um criador de conteúdo brasileiro de anime/games no YouTube.",
    "ESCREVA DE FORMA NATURAL E FALADA (como alguém conversando no microfone, com ritmo, gírias leves quando couber, perguntas retóricas e zero texto robótico ou clichê de IA).",
    "Retorne APENAS um JSON válido com:",
    '{ "title": string, "hookTop": string (2-3 palavras CAIXA ALTA), "hookBottom": string (2-3 palavras CAIXA ALTA), "scenes": [ { "index": number, "title": string, "speech": string (15-30 palavras naturais em PT-BR), "searchQuery": string (termo específico em inglês da cena/luta/personagem, nunca genérico), "mediaKind": "image" | "video", "motion": "zoom-in" | "zoom-out" | "pan-left" | "pan-right" } ] }',
  ].join("\n");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (aiProvider === "gemini" || (aiProvider === "auto" && geminiKey)) {
    if (!geminiKey) {
      return Response.json({
        ...buildFallbackStoryboard(briefing, style, durationMin),
        source: "fallback",
        aviso: "GEMINI_API_KEY não configurada no .env.local. Adicione sua chave grátis do Google AI Studio ou mude para OpenAI.",
      });
    }
    const gem = await generateWithGemini(geminiKey, prompt);
    if (gem.ok) {
      console.log(`[studio/storyboard] Gemini OK (modelo: ${gem.model})`);
      return Response.json({ ...gem.parsed, source: "gemini", model: gem.model });
    }
    console.warn(`[studio/storyboard] Gemini falhou: ${gem.error}`);
    if (aiProvider === "gemini") {
      return Response.json({
        ...buildFallbackStoryboard(briefing, style, durationMin),
        source: "fallback",
        aviso: `Gemini falhou (${gem.error}) — usando storyboard base.`,
      });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({
      ...buildFallbackStoryboard(briefing, style, durationMin),
      source: "fallback",
      aviso: "Configure GEMINI_API_KEY (grátis no Google AI Studio) ou OPENAI_API_KEY no .env.local para gerar roteiros naturais por IA.",
    });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      hookTop: { type: "string" },
      hookBottom: { type: "string" },
      scenes: {
        type: "array",
        minItems: 4,
        maxItems: 14,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            index: { type: "integer" },
            title: { type: "string" },
            speech: { type: "string" },
            searchQuery: { type: "string" },
            mediaKind: { type: "string", enum: ["image", "video"] },
            motion: { type: "string", enum: ["zoom-in", "zoom-out", "pan-left", "pan-right"] },
          },
          required: ["index", "title", "speech", "searchQuery", "mediaKind", "motion"],
        },
      },
    },
    required: ["title", "hookTop", "hookBottom", "scenes"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: "Você é roteirista brasileiro de YouTube/Shorts de anime com linguagem falada, envolvente e zero robótica." },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_schema", name: "studio_storyboard", strict: true, schema } },
      max_output_tokens: 3500,
    }),
  }).catch(() => null);

  if (!response) {
    return Response.json({
      ...buildFallbackStoryboard(briefing, style, durationMin),
      source: "fallback",
      aviso: "Não foi possível conectar à OpenAI — usando storyboard base. (Dica: adicione GEMINI_API_KEY grátis no .env.local).",
    });
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errDetail = result?.error?.message || `Erro ${response.status}`;
    return Response.json({
      ...buildFallbackStoryboard(briefing, style, durationMin),
      source: "fallback",
      aviso: `OpenAI falhou (${errDetail}) — usando storyboard base. Adicione GEMINI_API_KEY grátis no .env.local se quiser gerar por IA sem gastar créditos.`,
    });
  }

  const outputText = Array.isArray(result.output)
    ? result.output
        .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
        .find((item: { type?: string }) => item.type === "output_text")?.text
    : undefined;

  if (!outputText) {
    return Response.json({
      ...buildFallbackStoryboard(briefing, style, durationMin),
      source: "fallback",
    });
  }

  try {
    const parsed = JSON.parse(outputText);
    return Response.json({ ...parsed, source: "openai" });
  } catch {
    return Response.json({
      ...buildFallbackStoryboard(briefing, style, durationMin),
      source: "fallback",
    });
  }
  } catch (err) {
    return Response.json(
      { erro: err instanceof Error ? err.message : "Erro interno ao gerar storyboard." },
      { status: 500 },
    );
  }
}
