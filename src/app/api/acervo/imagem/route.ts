import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
const IMG = /\.(jpe?g|png|webp)$/i;
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const anime = params.get("anime")?.trim();
  const arquivo = params.get("arquivo")?.trim();
  if (!anime || !arquivo || anime === "." || anime === ".." || anime.includes("/") || anime.includes("\\") ||
      arquivo.includes("/") || arquivo.includes("\\") || !IMG.test(arquivo)) {
    return new Response("Parâmetros inválidos.", { status: 400 });
  }

  const root = path.resolve(process.cwd(), "acervo");
  const target = path.resolve(root, anime, arquivo);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return new Response("Imagem não encontrada.", { status: 404 });
  }

  return new Response(new Uint8Array(fs.readFileSync(target)), {
    headers: {
      "Content-Type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
