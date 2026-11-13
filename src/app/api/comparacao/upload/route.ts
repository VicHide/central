import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};
const MAX_BYTES = 80 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("arquivo");
  if (!(file instanceof File)) {
    return Response.json({ erro: "Envie uma imagem ou vídeo." }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return Response.json({ erro: "Formato não suportado. Use JPG, PNG, WebP, MP4, WebM ou MOV." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return Response.json({ erro: "O arquivo deve ter até 80 MB." }, { status: 413 });
  }

  const dir = path.join(process.cwd(), "public", "comparacoes");
  fs.mkdirSync(dir, { recursive: true });
  const nome = randomUUID() + ext;
  const destino = path.join(dir, nome);
  fs.writeFileSync(destino, Buffer.from(await file.arrayBuffer()));

  return Response.json({
    arquivo: "comparacoes/" + nome,
    nomeOriginal: file.name,
    tipo: file.type.startsWith("image/") ? "imagem" : "video",
    bytes: file.size,
  });
}
