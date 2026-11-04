import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
const IMG = /\.(jpe?g|png|webp)$/i;

export async function GET() {
  const raiz = process.cwd();
  const acervo = path.join(raiz, "acervo");
  const fh = path.join(raiz, "data", "historico.json");
  const hist: Record<string, string[]> = fs.existsSync(fh) ? JSON.parse(fs.readFileSync(fh, "utf8")) : {};
  const animes = fs.existsSync(acervo)
    ? fs.readdirSync(acervo, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({
        pasta: d.name,
        imagens: fs.readdirSync(path.join(acervo, d.name)).filter((f) => IMG.test(f)).length,
        usadas: (hist[d.name] ?? []).length,
      }))
    : [];
  const pp = path.join(raiz, "promos");
  const promos = fs.existsSync(pp) ? fs.readdirSync(pp).filter((f) => IMG.test(f)).length : 0;
  return Response.json({ animes, promos });
}
