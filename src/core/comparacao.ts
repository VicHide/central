import fs from "node:fs";
import path from "node:path";
import { renderVideo } from "./render";
import type { ComparisonProps, ComparisonSegment } from "../video/ComparisonVideo";

type SceneInput = {
  label: string;
  active: "left" | "right" | "none";
  speech: string;
  expression: "neutral" | "doubt" | "surprise";
};
type Payload = {
  id: string;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftMedia: string | null;
  rightMedia: string | null;
  voiceId: string;
  scenes: SceneInput[];
};

const RAIZ = process.cwd();
const VELOCIDADE_VOZ = 1.12;
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) => console.log("@@" + JSON.stringify(o));
const arg = (name: string) => {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
};

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

function safeMedia(relative: string | null) {
  if (!relative) return "";
  if (!/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(relative)) throw new Error("Arquivo de mídia inválido.");
  const file = path.resolve(RAIZ, "public", relative);
  const root = path.resolve(RAIZ, "public", "comparacoes");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error("Um dos arquivos enviados não foi encontrado.");
  return relative;
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
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY não está configurada.");

  preparaPersonagens();
  const leftMedia = safeMedia(payload.leftMedia);
  const rightMedia = safeMedia(payload.rightMedia);
  const isVideo = (file: string) => /\.(mp4|webm|mov)$/i.test(file);
  const leftVideo = isVideo(leftMedia) ? leftMedia : "";
  const rightVideo = isVideo(rightMedia) ? rightMedia : "";
  const leftStill = leftMedia && !leftVideo ? leftMedia : "";
  const rightStill = rightMedia && !rightVideo ? rightMedia : "";
  const fps = 30;
  const segments: ComparisonSegment[] = [];
  const audioDir = path.join(RAIZ, "public", "comparacoes", "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  for (const [index, scene] of payload.scenes.entries()) {
    evento({ etapa: "Gerando narração", pct: Math.round(((index + 1) / payload.scenes.length) * 9), detalhe: "Cena " + (index + 1) + "/" + payload.scenes.length });
    const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(payload.voiceId) + "?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: scene.speech,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.48, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("ElevenLabs recusou a narração da cena " + (index + 1) + ": " + detail.slice(0, 500));
    }
    const audio = Buffer.from(await response.arrayBuffer());
    const audioName = id + "-" + String(index + 1).padStart(2, "0") + ".mp3";
    fs.writeFileSync(path.join(audioDir, audioName), audio);
    const parsedDuration = mp3Duration(audio);
    const fallbackDuration = Math.max(2, scene.speech.trim().split(/\s+/).length / 2.5);
    const durationInFrames = Math.max(30, Math.ceil(((parsedDuration || fallbackDuration) / VELOCIDADE_VOZ) * fps) + 5);
    segments.push({
      durationInFrames,
      active: scene.active,
      speech: scene.speech,
      expression: scene.expression,
      leftStill,
      rightStill,
      leftVideoFrom: 0,
      rightVideoFrom: 0,
      leftPauseFrame: 0,
      rightPauseFrame: 0,
      audio: "comparacoes/audio/" + audioName,
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
