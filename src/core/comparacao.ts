import fs from "node:fs";
import path from "node:path";
import { renderVideo } from "./render";
import { sintetizaFala, TtsVoice } from "./tts";
import type { ComparisonProps, ComparisonSegment } from "../video/ComparisonVideo";

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
  voice?: TtsVoice;
  scenes: SceneInput[];
};

const RAIZ = process.cwd();
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) =>
  console.log("@@" + JSON.stringify(o));
const arg = (name: string) => {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
};

function safeMedia(relative: string | null | undefined) {
  if (!relative) return "";
  if (!/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(relative)) {
    throw new Error("Arquivo de mídia inválido.");
  }
  const file = path.resolve(RAIZ, "public", relative);
  const root = path.resolve(RAIZ, "public", "comparacoes");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    throw new Error("Um dos arquivos enviados não foi encontrado.");
  }
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
  const requestedVoice: TtsVoice = payload.voice ?? "leo";

  for (const [index, scene] of payload.scenes.entries()) {
    evento({
      etapa: `Gerando narração (${requestedVoice})`,
      pct: Math.round(((index + 1) / payload.scenes.length) * 9),
      detalhe: "Cena " + (index + 1) + "/" + payload.scenes.length,
    });
    const baseName = id + "-" + String(index + 1).padStart(2, "0");
    const res = await sintetizaFala(scene.speech, audioDir, baseName, requestedVoice);

    const fallbackDuration = Math.max(1.8, scene.speech.trim().split(/\s+/).length / 2.8);
    const effectiveDuration = (res.durationSec || fallbackDuration) / res.audioRate;
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
      words: res.words,
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
      audio: "comparacoes/audio/" + res.fileName,
      audioRate: res.audioRate,
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
  const nome =
    "comparacao-" +
    payload.title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) +
    "-" +
    id.slice(0, 8);
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
