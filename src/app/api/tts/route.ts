import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { aplicaPronuncia } from "@/core/pronuncia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_CHARS = 5000;
const SPEKO_URL = "https://api.speko.dev/v1/synthesize";

const EDGE_VOICES = {
  antonio: { id: "pt-BR-AntonioNeural", rate: "+16%", pitch: "+6Hz" },
  andrew: { id: "en-US-AndrewMultilingualNeural", rate: "+14%", pitch: "+2Hz" },
} as const;

async function geraEdgeVoz(text: string, key: keyof typeof EDGE_VOICES): Promise<Buffer> {
  const cfg = EDGE_VOICES[key];
  const destino = path.join(os.tmpdir(), `edge-${key}-${randomUUID()}.mp3`);
  const comandos = process.platform === "win32"
    ? [{ bin: "py", prefix: ["-3"] }, { bin: "python", prefix: [] }]
    : [{ bin: "python3", prefix: [] }, { bin: "python", prefix: [] }];
  let ultimoErro: unknown;

  try {
    for (const comando of comandos) {
      try {
        await execFileAsync(comando.bin, [
          ...comando.prefix,
          "-m", "edge_tts",
          "--voice", cfg.id,
          `--rate=${cfg.rate}`,
          `--pitch=${cfg.pitch}`,
          "--text", text,
          "--write-media", destino,
        ], { windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
        if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
          return fs.readFileSync(destino);
        }
        throw new Error("O Edge TTS não gerou o arquivo de áudio.");
      } catch (error) {
        ultimoErro = error;
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code !== "ENOENT") {
          throw error;
        }
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error("Edge TTS não encontrado. Instale com 'py -m pip install -r requirements-tts.txt'.");
  } finally {
    if (fs.existsSync(destino)) fs.unlinkSync(destino);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice: "leo" | "antonio" | "andrew" =
    body?.voice === "antonio" || body?.voice === "andrew" ? body.voice : "leo";

  if (!text) {
    return Response.json({ erro: "Digite um texto para gerar o áudio." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json(
      { erro: `O texto deve ter no máximo ${MAX_CHARS.toLocaleString("pt-BR")} caracteres por teste.` },
      { status: 413 }
    );
  }

  const spokenText = aplicaPronuncia(text);

  if (voice === "antonio" || voice === "andrew") {
    try {
      const mp3 = await geraEdgeVoz(spokenText, voice);
      return new Response(new Uint8Array(mp3), {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "audio/mpeg",
          "X-TTS-Provider": "edge-tts",
          "X-TTS-Model": EDGE_VOICES[voice].id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao gerar áudio com Edge TTS.";
      return Response.json({ erro: message }, { status: 500 });
    }
  }

  const apiKey = process.env.SPEKO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { erro: "SPEKO_API_KEY não está configurada no arquivo .env.local." },
      { status: 503 }
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
        text: spokenText,
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
