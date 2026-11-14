import fs from "node:fs";
import path from "node:path";
import { renderVideo } from "./render";
import { escolheMusica } from "./musica";
import { sintetizaFala, TtsVoice } from "./tts";
import type { StoryMotion, StorySegment, StoryShortProps } from "../video/StoryShort";
import type { MusicaProps } from "../video/Sons";

type StorySceneInput = {
  speech: string;
  media: string;
  motion?: StoryMotion;
  hookTop?: string;
  hookBottom?: string;
};

type StoryPayload = {
  id: string;
  title: string;
  voice?: TtsVoice;
  useMusic?: boolean;
  scenes: StorySceneInput[];
};

const RAIZ = process.cwd();
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) =>
  console.log("@@" + JSON.stringify(o));
const arg = (name: string) => {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
};

function safeMedia(relative: string) {
  if (!relative) return "";
  if (!/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(relative)) {
    throw new Error("Arquivo de mídia inválido.");
  }
  const file = path.resolve(RAIZ, "public", relative);
  const root = path.resolve(RAIZ, "public", "comparacoes");
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    throw new Error("Uma das mídias enviadas não foi encontrada.");
  }
  return relative;
}

async function main() {
  const id = arg("id");
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Identificador de render inválido.");
  const payloadPath = path.join(RAIZ, "data", "historias", `${id}.json`);
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as StoryPayload;

  const fps = 30;
  const voice: TtsVoice = payload.voice ?? "leo";
  const audioDir = path.join(RAIZ, "public", "historias", "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const { credito } = escolheMusica(Math.random, payload.useMusic !== false);
  const musicaPath = path.join(RAIZ, "data", "musica-atual.json");
  const musica = fs.existsSync(musicaPath)
    ? (JSON.parse(fs.readFileSync(musicaPath, "utf8")) as MusicaProps)
    : undefined;

  const segments: StorySegment[] = [];
  for (const [index, scene] of payload.scenes.entries()) {
    evento({
      etapa: `Gerando narração (${voice})`,
      pct: Math.round(((index + 1) / payload.scenes.length) * 12),
      detalhe: `Cena ${index + 1}/${payload.scenes.length}`,
    });

    const media = safeMedia(scene.media);
    const mediaType: "image" | "video" = /\.(mp4|webm|mov)$/i.test(media) ? "video" : "image";
    const baseName = `${id}-${String(index + 1).padStart(2, "0")}`;
    const res = await sintetizaFala(scene.speech, audioDir, baseName, voice);

    const fallbackDuration = Math.max(1.8, scene.speech.trim().split(/\s+/).length / 2.8);
    const effectiveDuration = (res.durationSec || fallbackDuration) / res.audioRate;
    const durationInFrames = Math.max(24, Math.ceil(effectiveDuration * fps) + 1);

    segments.push({
      durationInFrames,
      media,
      mediaType,
      motion: scene.motion,
      speech: scene.speech,
      hookTop: scene.hookTop?.trim() || undefined,
      hookBottom: scene.hookBottom?.trim() || undefined,
      audio: `historias/audio/${res.fileName}`,
      audioRate: res.audioRate,
      words: res.words,
    });
  }

  const props: StoryShortProps = {
    title: payload.title,
    segments,
    musica,
  };

  const slug = payload.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "short";
  const nome = `short-${slug}-${id.slice(0, 8)}`;
  const saida = path.join(RAIZ, "out", `${nome}.mp4`);

  if (credito) {
    fs.writeFileSync(path.join(RAIZ, "out", `${nome}.txt`), `${payload.title}\n\n${credito}\n`, "utf8");
  }

  evento({ etapa: "Narração concluída", pct: 20, detalhe: "Preparando composição e render" });
  await renderVideo("StoryShort", saida, (o) => evento(o), props as unknown as Record<string, unknown>);
  evento({ etapa: "Concluído", pct: 100, detalhe: `out/${nome}.mp4` });
  console.log(`Vídeo salvo em out/${nome}.mp4`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
