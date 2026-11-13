import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

// A fonte vem junto com o projeto (src/assets/fonts), então o título sai igual em qualquer computador.
let fonte: opentype.Font | null = null;
function carrega(): opentype.Font {
  if (!fonte) {
    const b = fs.readFileSync(path.join(process.cwd(), "src", "assets", "fonts", "LuckiestGuy-latin.woff"));
    fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return fonte;
}

export const larguraTexto = (texto: string, tam: number) => carrega().getAdvanceWidth(texto, tam);
// Converte o texto em contorno vetorial (path SVG) com a base da linha em y.
export const textoPath = (texto: string, x: number, y: number, tam: number) => carrega().getPath(texto, x, y, tam).toPathData(2);
