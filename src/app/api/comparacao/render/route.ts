import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { iniciaJob, temJobRodando } from "@/server/jobs";

export const dynamic = "force-dynamic";

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

function validMedia(value: unknown) {
  if (typeof value !== "string" || !/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(value)) return null;
  const root = path.resolve(process.cwd(), "public", "comparacoes");
  const file = path.resolve(process.cwd(), "public", value);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
  return value;
}

export async function POST(req: Request) {
  if (temJobRodando()) return Response.json({ erro: "Já existe uma tarefa em andamento. Aguarde ela terminar." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const leftLabel = typeof body.leftLabel === "string" ? body.leftLabel.trim().slice(0, 80) : "";
  const rightLabel = typeof body.rightLabel === "string" ? body.rightLabel.trim().slice(0, 80) : "";
  const leftMedia = validMedia(body.leftMedia);
  const rightMedia = validMedia(body.rightMedia);
  const scenes = Array.isArray(body.scenes) ? body.scenes as SceneInput[] : [];

  if (!title || !leftLabel || !rightLabel) {
    return Response.json({ erro: "Informe o tema e os nomes dos quadros." }, { status: 400 });
  }
  if (scenes.length < 8 || scenes.length > 10 || scenes.some((scene) =>
    !scene || typeof scene.speech !== "string" || !scene.speech.trim() || scene.speech.length > 1800 ||
    !["left", "right", "none"].includes(scene.active) ||
    !["neutral", "doubt", "surprise"].includes(scene.expression)
  )) {
    return Response.json({ erro: "O roteiro precisa ter de 8 a 10 cenas válidas, com falas preenchidas." }, { status: 400 });
  }
  const hasSceneMedia = scenes.some((s) => Boolean(validMedia(s.leftMedia) || validMedia(s.rightMedia)));
  if (!leftMedia && !rightMedia && !hasSceneMedia) return Response.json({ erro: "Envie pelo menos uma imagem ou vídeo para montar a comparação." }, { status: 400 });

  const id = randomUUID();
  const dir = path.join(process.cwd(), "data", "comparacoes");
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    id, title, leftLabel, rightLabel, leftMedia, rightMedia,
    scenes: scenes.map((scene) => ({
      label: String(scene.label ?? "").slice(0, 100),
      active: scene.active,
      speech: scene.speech.trim(),
      expression: scene.expression,
      leftLabel: typeof scene.leftLabel === "string" && scene.leftLabel.trim() ? scene.leftLabel.trim().slice(0, 80) : undefined,
      rightLabel: typeof scene.rightLabel === "string" && scene.rightLabel.trim() ? scene.rightLabel.trim().slice(0, 80) : undefined,
      leftMedia: validMedia(scene.leftMedia) ?? undefined,
      rightMedia: validMedia(scene.rightMedia) ?? undefined,
    })),
  };
  fs.writeFileSync(path.join(dir, id + ".json"), JSON.stringify(payload, null, 2), "utf8");

  const totalWords = scenes.reduce((sum, scene) => sum + scene.speech.trim().split(/\s+/).length, 0);
  const estimatedSeconds = Math.max(10, Math.round(totalWords / 2.6));
  const job = iniciaJob("Comparação · " + title, ["tsx", "src/core/comparacao.ts", "--id", id], {
    n: scenes.length,
    render: true,
    duracaoSeg: estimatedSeconds,
    resumo: title,
    preparo: "Edge TTS · Antonio · narração por cena",
  });
  return Response.json({ jobId: job.id, message: "Narração iniciada. O vídeo será renderizado automaticamente ao terminar." });
}
