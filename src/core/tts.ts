import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { aplicaPronuncia } from "./pronuncia";

const execFileAsync = promisify(execFile);
const SPEKO_URL = "https://api.speko.dev/v1/synthesize";
export const SPEKO_RATE = 1.08;

export type TtsVoice = "leo" | "antonio" | "andrew";

export type TtsWord = {
  text: string;
  startMs: number;
  endMs: number;
};

const EDGE_VOICES = {
  antonio: { voice: "pt-BR-AntonioNeural", rate: "+16%", pitch: "+6Hz" },
  andrew: { voice: "en-US-AndrewMultilingualNeural", rate: "+14%", pitch: "+2Hz" },
} as const;

const EDGE_TTS_SCRIPT = [
  "import asyncio, json, sys, edge_tts",
  "async def main():",
  "    text, voice, rate, pitch, audio_path, words_path = sys.argv[1:7]",
  "    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)",
  "    words = []",
  "    with open(audio_path, 'wb') as f:",
  "        async for chunk in comm.stream():",
  "            if chunk['type'] == 'audio':",
  "                f.write(chunk['data'])",
  "            elif chunk['type'] == 'WordBoundary':",
  "                start_ms = round(chunk['offset'] / 10000)",
  "                end_ms = round((chunk['offset'] + chunk['duration']) / 10000)",
  "                words.append({'text': chunk['text'], 'startMs': start_ms, 'endMs': end_ms})",
  "    with open(words_path, 'w', encoding='utf-8') as wf:",
  "        json.dump(words, wf, ensure_ascii=False)",
  "asyncio.run(main())",
].join("\n");

export function getSpekoApiKey() {
  if (process.env.SPEKO_API_KEY) return process.env.SPEKO_API_KEY;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const match = fs.readFileSync(envPath, "utf8").match(/^SPEKO_API_KEY=(.+)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

function mp3Duration(buffer: Buffer) {
  let offset = 0;
  if (buffer.toString("ascii", 0, 3) === "ID3" && buffer.length >= 10) {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    offset = 10 + size;
  }
  let seconds = 0;
  const mpeg1Layer3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) { offset++; continue; }
    const version = (buffer[offset + 1] >> 3) & 3;
    const layer = (buffer[offset + 1] >> 1) & 3;
    const bitrateIndex = (buffer[offset + 2] >> 4) & 15;
    const sampleIndex = (buffer[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) { offset++; continue; }
    const sampleRates = [44100, 48000, 32000];
    const sampleRate = sampleRates[sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrate = (version === 3 ? mpeg1Layer3 : mpeg2Layer3)[bitrateIndex] * 1000;
    const padding = (buffer[offset + 2] >> 1) & 1;
    const frameLength = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + padding;
    if (frameLength < 24) { offset++; continue; }
    seconds += (version === 3 ? 1152 : 576) / sampleRate;
    offset += frameLength;
  }
  return seconds;
}

function wavDuration(buffer: Buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") return 0;
  const byteRate = buffer.readUInt32LE(28);
  return byteRate > 0 ? (buffer.length - 44) / byteRate : 0;
}

function wrapPcmAsWav(pcm: Buffer, sampleRate = 24000) {
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
  return Buffer.concat([wavHeader, pcm]);
}

async function geraSpeko(
  spokenText: string,
  audioDir: string,
  baseName: string,
  apiKey: string,
): Promise<{ fileName: string; durationSec: number }> {
  const res = await fetch(SPEKO_URL, {
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
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Speko retornou erro ${res.status}: ${detail.slice(0, 200)}`);
  }

  const headerFmt = res.headers.get("x-speko-audio-format")?.trim().toLowerCase() ?? "";
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const raw = Buffer.from(await res.arrayBuffer());
  if (raw.length === 0) throw new Error("O Speko retornou um áudio vazio.");

  if (headerFmt === "pcm" || contentType.startsWith("audio/pcm")) {
    const rateMatch = contentType.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const wav = wrapPcmAsWav(raw, sampleRate);
    const fileName = `${baseName}.wav`;
    fs.writeFileSync(path.join(audioDir, fileName), wav);
    return { fileName, durationSec: wavDuration(wav) };
  }

  const ext = headerFmt === "wav" || contentType.includes("wav") ? "wav" : "mp3";
  const fileName = `${baseName}.${ext}`;
  fs.writeFileSync(path.join(audioDir, fileName), raw);
  const durationSec = ext === "wav" ? wavDuration(raw) : mp3Duration(raw);
  return { fileName, durationSec };
}

async function geraEdge(
  spokenText: string,
  destino: string,
  edgeCfg: { voice: string; rate: string; pitch: string },
): Promise<{ durationSec: number; words?: TtsWord[] }> {
  const comandos = process.platform === "win32"
    ? [{ bin: "py", prefix: ["-3"] }, { bin: "python", prefix: [] }]
    : [{ bin: "python3", prefix: [] }, { bin: "python", prefix: [] }];
  const wordsPath = destino.replace(/\.mp3$/i, ".words.json");
  let ultimoErro: unknown;

  for (const comando of comandos) {
    try {
      await execFileAsync(comando.bin, [
        ...comando.prefix,
        "-c", EDGE_TTS_SCRIPT,
        spokenText, edgeCfg.voice, edgeCfg.rate, edgeCfg.pitch, destino, wordsPath,
      ], { windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
      if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
        const durationSec = mp3Duration(fs.readFileSync(destino));
        let words: TtsWord[] | undefined;
        if (fs.existsSync(wordsPath)) {
          const parsed = JSON.parse(fs.readFileSync(wordsPath, "utf8")) as TtsWord[];
          if (Array.isArray(parsed) && parsed.length > 0) words = parsed;
        }
        return { durationSec, words };
      }
      throw new Error("O Edge TTS não gerou o arquivo de áudio.");
    } catch (error) {
      ultimoErro = error;
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code !== "ENOENT") {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error("Falha ao gerar áudio com Edge TTS: " + detail);
      }
    }
  }
  const detail = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro ?? "");
  throw new Error("Edge TTS não encontrado. Instale com 'py -m pip install -r requirements-tts.txt'. " + detail);
}

/**
 * Sintetiza uma fala usando a voz escolhida (com pronúncia fonética aplicada)
 * e retorna o arquivo salvo, a duração efetiva e timestamps de palavras quando disponíveis.
 */
export async function sintetizaFala(
  originalSpeech: string,
  audioDir: string,
  baseName: string,
  requestedVoice: TtsVoice = "leo",
): Promise<{ fileName: string; durationSec: number; audioRate: number; words?: TtsWord[] }> {
  const spoken = aplicaPronuncia(originalSpeech);
  const spekoKey = getSpekoApiKey();
  const useSpeko = requestedVoice === "leo" && Boolean(spekoKey);

  if (useSpeko) {
    const res = await geraSpeko(spoken, audioDir, baseName, spekoKey);
    return { fileName: res.fileName, durationSec: res.durationSec, audioRate: SPEKO_RATE };
  }

  const edgeCfg = requestedVoice === "andrew" ? EDGE_VOICES.andrew : EDGE_VOICES.antonio;
  const fileName = `${baseName}.mp3`;
  const destino = path.join(audioDir, fileName);
  const res = await geraEdge(spoken, destino, edgeCfg);
  const originalTokens = originalSpeech.trim().split(/\s+/).filter(Boolean);
  const words = res.words?.map((w, i) => ({ ...w, text: originalTokens[i] ?? w.text }));
  return { fileName, durationSec: res.durationSec, audioRate: 1, words };
}
