import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
const IMG = /\.(jpe?g|png|webp)$/i;

export async function GET(request: Request) {
  const anime = new URL(request.url).searchParams.get("anime")?.trim();
  if (!anime || anime === "." || anime === ".." || anime.includes("/") || anime.includes("\\")) {
    return Response.json({ erro: "Pasta inválida." }, { status: 400 });
  }

  const root = path.resolve(process.cwd(), "acervo");
  const folder = path.resolve(root, anime);
  if (!folder.startsWith(root + path.sep) || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return Response.json({ erro: "Pasta não encontrada." }, { status: 404 });
  }

  const imagens = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMG.test(entry.name))
    .map((entry) => ({
      nome: entry.name,
      url: "/api/acervo/imagem?anime=" + encodeURIComponent(anime) + "&arquivo=" + encodeURIComponent(entry.name),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return Response.json({ imagens });
}
