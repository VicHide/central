import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

// As fontes vêm junto com o projeto (src/assets/fonts), então o texto sai igual em qualquer computador.
export type NomeFonte = "luckiest" | "montserrat";
const ARQUIVOS: Record<NomeFonte, string> = {
  luckiest: "LuckiestGuy-latin.woff", // títulos em 3D das thumbnails
  montserrat: "Montserrat-Black-Italic-latin.woff", // faixas do Top 10 vertical
};
const cache = new Map<NomeFonte, opentype.Font>();

function carrega(nome: NomeFonte): opentype.Font {
  let f = cache.get(nome);
  if (!f) {
    const b = fs.readFileSync(path.join(process.cwd(), "src", "assets", "fonts", ARQUIVOS[nome]));
    f = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    cache.set(nome, f);
  }
  return f;
}

export const larguraTexto = (texto: string, tam: number, fonte: NomeFonte = "luckiest") => carrega(fonte).getAdvanceWidth(texto, tam);
// Converte o texto em contorno vetorial (path SVG) com a base da linha em y.
export const textoPath = (texto: string, x: number, y: number, tam: number, fonte: NomeFonte = "luckiest") => carrega(fonte).getPath(texto, x, y, tam).toPathData(2);
