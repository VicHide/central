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

    // Speko may return application/octet-stream; X-Speko-Audio-Format contains the actual format.
    const audioFormat = upstream.headers.get("x-speko-audio-format")?.trim().toLowerCase();
    const formatMimeTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      aac: "audio/aac",
      flac: "audio/flac",
      pcm: "audio/pcm",
    };
    const normalizedFormat = audioFormat
      ? audioFormat.includes("/") ? audioFormat : formatMimeTypes[audioFormat]
      : undefined;
    const contentType = normalizedFormat || upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      return Response.json({ erro: "O Speko retornou um formato de resposta inesperado." }, { status: 502 });
    }

    const audioHeaders = {
      "Cache-Control": "no-store",
      "X-TTS-Provider": upstream.headers.get("x-speko-provider") || "xai",
      "X-TTS-Model": upstream.headers.get("x-speko-model") || "tts",
    };

    // Browsers cannot play raw PCM. Wrap signed 16-bit little-endian mono PCM
    // in a WAV container so the preview works without transcoding the samples.
    if (contentType.toLowerCase().startsWith("audio/pcm")) {
      const rateMatch = contentType.match(/rate=(\\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
      const pcm = Buffer.from(await upstream.arrayBuffer());

      if (pcm.length === 0 || pcm.length % 2 !== 0) {
        return Response.json({ erro: "O Speko retornou um PCM inválido ou incompleto." }, { status: 502 });
      }

      const wavHeader = Buffer.alloc(44);
      wavHeader.write("RIFF", 0);
      wavHeader.writeUInt32LE(36 + pcm.length, 4);
      wavHeader.write("WAVE", 8);
      wavHeader.write("fmt ", 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20);
      wavHeader.writeUInt16LE(1, 22);
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(sampleRate * 2, 28);
      wavHeader.writeUInt16LE(2, 32);
      wavHeader.writeUInt16LE(16, 34);
      wavHeader.write("data", 36);
      wavHeader.writeUInt32LE(pcm.length, 40);

      return new Response(Buffer.concat([wavHeader, pcm]), {
        status: 200,
        headers: { ...audioHeaders, "Content-Type": "audio/wav" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { ...audioHeaders, "Content-Type": contentType },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "A geração demorou mais que o esperado. Tente novamente."
      : "Não foi possível conectar ao Speko. Confira sua conexão e tente novamente.";
    return Response.json({ erro: message }, { status: 502 });
  }
}
