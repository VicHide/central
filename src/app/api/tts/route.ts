export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 5000;
const SPEKO_URL = "https://api.speko.dev/v1/synthesize";

export async function POST(req: Request) {
  const apiKey = process.env.SPEKO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { erro: "SPEKO_API_KEY não está configurada no arquivo .env.local." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return Response.json({ erro: "Digite um texto para gerar o áudio." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json(
      { erro: `O texto deve ter no máximo ${MAX_CHARS.toLocaleString("pt-BR")} caracteres por teste.` },
      { status: 413 }
    );
  }

  try {
    const upstream = await fetch(SPEKO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        intent: { language: "pt-BR", optimizeFor: "accuracy" },
        voice: "leo",
        model: "tts",
        workload: "narration",
        constraints: { allowedProviders: { tts: ["xai"] } },
      }),
      signal: AbortSignal.timeout(90000),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      let message = "O Speko não conseguiu gerar o áudio.";
      try {
        const parsed = JSON.parse(detail);
        if (typeof parsed.error === "string") message = parsed.error;
        else if (typeof parsed.message === "string") message = parsed.message;
      } catch {
        // Não repassa respostas HTML ou detalhes internos do provedor ao navegador.
      }
      return Response.json({ erro: message }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      return Response.json({ erro: "O Speko retornou um formato de resposta inesperado." }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-TTS-Provider": upstream.headers.get("x-speko-provider") || "xai",
        "X-TTS-Model": upstream.headers.get("x-speko-model") || "tts",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "A geração demorou mais que o esperado. Tente novamente."
      : "Não foi possível conectar ao Speko. Confira sua conexão e tente novamente.";
    return Response.json({ erro: message }, { status: 502 });
  }
}
