import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
const IMG = /\.(jpe?g|png|webp)$/i;

export async function GET() {
  const raiz = process.cwd();
  const acervo = path.join(raiz, "acervo");
  const animes = fs.existsSync(acervo)
    ? fs.readdirSync(acervo, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.readdirSync(path.join(acervo, d.name)).some((f) => IMG.test(f))).length
    : 0;
  const pp = path.join(raiz, "promos");
  const promos = fs.existsSync(pp) ? fs.readdirSync(pp).filter((f) => IMG.test(f)).length : 0;
  // O Remotion guarda o navegador interno aqui depois da primeira renderização.
  const navegador = fs.existsSync(path.join(raiz, "node_modules", ".remotion"));
  return Response.json({ animes, promos, navegador });
}
