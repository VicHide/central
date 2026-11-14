import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { iniciaJob, temJobRodando } from "@/server/jobs";

export const dynamic = "force-dynamic";

type SceneInput = {
  speech: string;
  media: string;
  motion?: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  hookTop?: string;
  hookBottom?: string;
};

function validMedia(value: unknown) {
  if (typeof value !== "string" || !/^comparacoes\/[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(value)) {
    return null;
  }
  const root = path.resolve(process.cwd(), "public", "comparacoes");
  const file = path.resolve(process.cwd(), "public", value);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null;
  return value;
}

export async function POST(req: Request) {
  if (temJobRodando()) {
    return Response.json({ erro: "Já existe uma tarefa em andamento. Aguarde ela terminar." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
  const voice = body.voice === "puck" || body.voice === "fenrir" || body.voice === "antonio" || body.voice === "andrew" || body.voice === "leo" ? body.voice : "leo";
  const useMusic = body.useMusic !== false;
  const scenes = Array.isArray(body.scenes) ? (body.scenes as SceneInput[]) : [];

  if (!title) {
    return Response.json({ erro: "Informe o título/tema do Short." }, { status: 400 });
  }
  if (scenes.length < 2 || scenes.length > 14) {
    return Response.json({ erro: "Adicione entre 2 e 14 cenas com falas e mídias." }, { status: 400 });
  }

  const sanitized = scenes.map((s) => ({
    speech: typeof s?.speech === "string" ? s.speech.trim().slice(0, 1000) : "",
    media: validMedia(s?.media),
    motion:
      s?.motion === "zoom-in" || s?.motion === "zoom-out" || s?.motion === "pan-left" || s?.motion === "pan-right"
        ? s.motion
        : undefined,
    hookTop: typeof s?.hookTop === "string" ? s.hookTop.trim().slice(0, 40) : undefined,
    hookBottom: typeof s?.hookBottom === "string" ? s.hookBottom.trim().slice(0, 40) : undefined,
  }));

  if (sanitized.some((s) => !s.speech || !s.media)) {
    return Response.json({ erro: "Todas as cenas precisam ter fala e uma imagem ou vídeo enviado." }, { status: 400 });
  }

  const id = randomUUID();
  const dir = path.join(process.cwd(), "data", "historias");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ id, title, voice, useMusic, scenes: sanitized }, null, 2),
    "utf8",
  );

  const totalWords = sanitized.reduce((sum, s) => sum + s.speech.split(/\s+/).length, 0);
  const estimatedSeconds = Math.max(8, Math.round(totalWords / 2.8));

  const job = iniciaJob(`Short narrado · ${title}`, ["tsx", "src/core/historia.ts", "--id", id], {
    n: sanitized.length,
    render: true,
    duracaoSeg: estimatedSeconds,
    resumo: title,
    preparo: `${voice} · ${sanitized.length} cenas`,
  });

  return Response.json({ jobId: job.id, message: "Renderização do Short iniciada." });
}
