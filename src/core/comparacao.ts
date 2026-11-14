import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderVideo } from "./render";
import type { ComparisonProps, ComparisonSegment, WordTiming } from "../video/ComparisonVideo";

type SceneInput = {
  label: string;
  active: "left" | "right" | "none";
  speech: string;
  expression: "neutral" | "doubt" | "surprise";
  leftLabel?: string;
  rightLabel?: string;
  leftMedia?: string | null;
  rightMedia?: string | null;
};

type Payload = {
  id: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftMedia: string | null;
  rightMedia: string | null;
  voice?: "leo" | "antonio" | "andrew";
  scenes: SceneInput[];
};

const RAIZ = process.cwd();
const execFileAsync = promisify(execFile);
const SPEKO_RATE = 1.08;
const EDGE_VOICES = {
  antonio: { voice: "pt-BR-AntonioNeural", rate: "+16%", pitch: "+6Hz" },
  andrew: { voice: "en-US-AndrewMultilingualNeural", rate: "+14%", pitch: "+2Hz" },
} as const;
const SPEKO_URL = "https://api.speko.dev/v1/synthesize";
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) => console.log("@@" + JSON.stringify(o));
const arg = (name: string) => {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
};

function getSpekoApiKey() {
  if (process.env.SPEKO_API_KEY) return process.env.SPEKO_API_KEY;
  const envPath = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const match = fs.readFileSync(envPath, "utf8").match(/^SPEKO_API_KEY=(.+)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
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

function safeMedia(relative: string | null | undefined) {
  if (!relative) return "";
  if (!/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(relative)) throw new Error("Arquivo de mídia inválido.");
  const file = path.resolve(RAIZ, "public", relative);
  const root = path.resolve(RAIZ, "public", "comparacoes");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error("Um dos arquivos enviados não foi encontrado.");
  return relative;
}

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

async function geraAudioSpeko(
  text: string,
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
      text,
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

async function geraAudio(
  text: string,
  destino: string,
  edgeCfg: { voice: string; rate: string; pitch: string },
): Promise<WordTiming[] | undefined> {
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
        text, edgeCfg.voice, edgeCfg.rate, edgeCfg.pitch, destino, wordsPath,
      ], { windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
      if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
        if (fs.existsSync(wordsPath)) {
          const parsed = JSON.parse(fs.readFileSync(wordsPath, "utf8")) as WordTiming[];
          return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
        }
        return undefined;
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
  throw new Error("Edge TTS não encontrado. Instale as dependências com 'py -m pip install -r requirements-tts.txt' e tente novamente. " + detail);
}

function preparaPersonagens() {
  const origem = path.join(RAIZ, "acervo");
  const destino = path.join(RAIZ, "public", "comparacoes", "personagens");
  const arquivos = ["direita.png", "esquerda.png", "duvida.png"];
  fs.mkdirSync(destino, { recursive: true });
  for (const arquivo of arquivos) {
    const source = path.join(origem, arquivo);
    if (!fs.existsSync(source)) throw new Error("Personagem não encontrado no acervo: " + arquivo);
    fs.copyFileSync(source, path.join(destino, arquivo));
  }
}

async function main() {
  const id = arg("id");
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Identificador de render inválido.");
  const payloadPath = path.join(RAIZ, "data", "comparacoes", id + ".json");
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as Payload;
  preparaPersonagens();

  const defaultLeftMedia = safeMedia(payload.leftMedia);
  const defaultRightMedia = safeMedia(payload.rightMedia);
  const isVideo = (file: string) => /\.(mp4|webm|mov)$/i.test(file);
  const leftVideo = isVideo(defaultLeftMedia) ? defaultLeftMedia : "";
  const rightVideo = isVideo(defaultRightMedia) ? defaultRightMedia : "";
  const fps = 30;
  const segments: ComparisonSegment[] = [];
  const audioDir = path.join(RAIZ, "public", "comparacoes", "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const videoCursor = new Map<string, number>();
  const spekoKey = getSpekoApiKey();
  const requestedVoice = payload.voice ?? "leo";
  const useSpeko = requestedVoice === "leo" && Boolean(spekoKey);
  const edgeCfg = requestedVoice === "andrew" ? EDGE_VOICES.andrew : EDGE_VOICES.antonio;

  for (const [index, scene] of payload.scenes.entries()) {
    evento({
      etapa: useSpeko ? "Gerando narração (Speko · Leo)" : `Gerando narração (${edgeCfg.voice})`,
      pct: Math.round(((index + 1) / payload.scenes.length) * 9),
      detalhe: "Cena " + (index + 1) + "/" + payload.scenes.length,
    });
    const baseName = id + "-" + String(index + 1).padStart(2, "0");
    let audioFileName = `${baseName}.mp3`;
    let words: WordTiming[] | undefined;
    let parsedDuration = 0;
    let audioRate = 1;

    if (useSpeko) {
      const res = await geraAudioSpeko(scene.speech, audioDir, baseName, spekoKey);
      audioFileName = res.fileName;
      parsedDuration = res.durationSec;
      audioRate = SPEKO_RATE;
    } else {
      const audioPath = path.join(audioDir, audioFileName);
      words = await geraAudio(scene.speech, audioPath, edgeCfg);
      parsedDuration = mp3Duration(fs.readFileSync(audioPath));
    }

    const fallbackDuration = Math.max(1.8, scene.speech.trim().split(/\s+/).length / 2.8);
    const effectiveDuration = (parsedDuration || fallbackDuration) / audioRate;
    const durationInFrames = Math.max(24, Math.ceil(effectiveDuration * fps) + 1);

    const sceneLeftMedia = scene.leftMedia ? safeMedia(scene.leftMedia) : defaultLeftMedia;
    const sceneRightMedia = scene.rightMedia ? safeMedia(scene.rightMedia) : defaultRightMedia;
    const sceneLeftVideo = isVideo(sceneLeftMedia) ? sceneLeftMedia : "";
    const sceneRightVideo = isVideo(sceneRightMedia) ? sceneRightMedia : "";
    const sceneLeftStill = sceneLeftMedia && !sceneLeftVideo ? sceneLeftMedia : "";
    const sceneRightStill = sceneRightMedia && !sceneRightVideo ? sceneRightMedia : "";

    const leftCursor = sceneLeftVideo ? (videoCursor.get(sceneLeftVideo) ?? 0) : 0;
    const rightCursor = sceneRightVideo ? (videoCursor.get(sceneRightVideo) ?? 0) : 0;

    if (sceneLeftVideo && scene.active === "left") {
      videoCursor.set(sceneLeftVideo, leftCursor + durationInFrames);
    }
    if (sceneRightVideo && scene.active === "right") {
      videoCursor.set(sceneRightVideo, rightCursor + durationInFrames);
    }

    segments.push({
      durationInFrames,
      active: scene.active,
      speech: scene.speech,
      expression: scene.expression,
      words,
      leftLabel: scene.leftLabel?.trim() || undefined,
      rightLabel: scene.rightLabel?.trim() || undefined,
      leftStill: sceneLeftStill,
      rightStill: sceneRightStill,
      leftVideo: sceneLeftVideo || undefined,
      rightVideo: sceneRightVideo || undefined,
      leftVideoFrom: leftCursor,
      rightVideoFrom: rightCursor,
      leftPauseFrame: leftCursor,
      rightPauseFrame: rightCursor,
      audio: "comparacoes/audio/" + audioFileName,
      audioRate,
    });
  }

  const props: ComparisonProps = {
    title: payload.title,
    leftLabel: payload.leftLabel,
    rightLabel: payload.rightLabel,
    leftVideo,
    rightVideo,
    segments,
  };
  const nome = "comparacao-" + payload.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) + "-" + id.slice(0, 8);
  const saida = path.join(RAIZ, "out", nome + ".mp4");
  evento({ etapa: "Narração concluída", pct: 19, detalhe: "Preparando composição e render" });
  await renderVideo("ComparisonVideo", saida, (o) => evento(o), props as unknown as Record<string, unknown>);
  evento({ etapa: "Concluído", pct: 100, detalhe: "out/" + nome + ".mp4" });
  console.log("Vídeo salvo em out/" + nome + ".mp4");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
