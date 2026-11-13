import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { comporThumbnail, pngTocaTopo, type Layout, type Segmento } from "@/server/thumbnail/compor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Registro = {
  numero?: number;
  capa?: string | null;
  imagem?: string | null;
  imagens?: (string | null)[];
};

const EXT = /\.(jpe?g|png|webp)$/i;
const raiz = process.cwd();
const raizPublica = path.resolve(raiz, "public");
const pastaPngs = path.resolve(raiz, "acervo", "pngs");

function arquivoPublico(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const relativo = valor.replace(/^\/+/, "").replace(/^public\//, "");
  if (!EXT.test(relativo)) return null;
  const absoluto = path.resolve(raizPublica, relativo);
  if (!absoluto.startsWith(raizPublica + path.sep) || !fs.existsSync(absoluto)) return null;
  return absoluto;
}

function embaralha<T>(itens: T[]): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Escolhe o PNG do personagem. PNG com o topo cortado (cabelo cortado) combina com o layout lateral,
// onde ele sangra para fora da borda de cima; no layout centro damos preferência aos PNGs inteiros.
async function escolhePng(layout: Layout): Promise<string | null> {
  if (!fs.existsSync(pastaPngs)) return null;
  const arquivos = fs.readdirSync(pastaPngs, { withFileTypes: true })
    .filter((item) => item.isFile() && /\.png$/i.test(item.name))
    .map((item) => path.join(pastaPngs, item.name));
  if (arquivos.length === 0) return null;
  const cortados: string[] = [], inteiros: string[] = [];
  for (const f of arquivos) {
    try { ((await pngTocaTopo(f, fs.statSync(f).mtimeMs)) ? cortados : inteiros).push(f); } catch { inteiros.push(f); }
  }
  const preferidos = layout === "lateral"
    ? (cortados.length && randomInt(10) < 7 ? cortados : arquivos)
    : (inteiros.length ? inteiros : arquivos);
  return preferidos[randomInt(preferidos.length)];
}

export async function POST(req: Request) {
  try {
    const corpo = (await req.json().catch(() => ({}))) as { layout?: unknown; seta?: unknown; tema?: unknown };
    const layout: Layout | null = corpo.layout === undefined || corpo.layout === "centro" ? "centro" : corpo.layout === "lateral" ? "lateral" : null;
    if (!layout) return Response.json({ erro: "Layout inválido. Use centro ou lateral." }, { status: 400 });
    const seta = corpo.seta !== false;
    const tema = typeof corpo.tema === "string" ? corpo.tema.trim().toUpperCase() : "";
    if (tema && !/^[A-ZÀ-Ý0-9 ]{1,18}$/.test(tema)) {
      return Response.json({ erro: "O tema aceita só letras, números e espaços (até 18 caracteres)." }, { status: 400 });
    }

    const arquivoPng = await escolhePng(layout);
    if (!arquivoPng) {
      return Response.json({ erro: "Não encontrei arquivos PNG em acervo/pngs. Adicione pelo menos um PNG nessa pasta." }, { status: 422 });
    }

    const intro = JSON.parse(fs.readFileSync(path.join(raiz, "data", "intro.json"), "utf8")) as { modo?: string };
    const modo = intro.modo === "zoom" ? "zoom" : "quatro";
    const nomeArquivo = modo === "zoom" ? "zoom.json" : "perguntas.json";
    const dados = JSON.parse(fs.readFileSync(path.join(raiz, "data", nomeArquivo), "utf8")) as Registro[];
    if (!Array.isArray(dados) || dados.length < 4) {
      return Response.json({ erro: "O último quiz precisa ter pelo menos 4 animes para montar a thumbnail." }, { status: 422 });
    }

    // Cada cartão mostra uma cena do anime; se não houver, usa a capa.
    const candidatos = dados.map((registro) => {
      const cenas = modo === "zoom" ? [registro.imagem] : (registro.imagens ?? []);
      const arquivos = cenas.map(arquivoPublico).filter((f): f is string => Boolean(f));
      return arquivos.length ? arquivos[randomInt(arquivos.length)] : arquivoPublico(registro.capa);
    }).filter((f): f is string => Boolean(f));
    if (candidatos.length < 4) {
      return Response.json({ erro: "Encontrei menos de 4 animes com imagens válidas no último quiz." }, { status: 422 });
    }

    const titulo: Segmento[][] = [[{ texto: String(dados.length), cor: "branco" }, { texto: "ANIMES", cor: "ouro" }]];
    if (tema) titulo.push([{ texto: tema, cor: "roxo" }]);

    const png = await comporThumbnail({
      layout,
      cartoes: embaralha(candidatos).slice(0, 4),
      personagem: arquivoPng,
      titulo,
      seta,
      seed: randomInt(1_000_000_000),
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="thumbnail-${layout}.png"`,
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail. Confira se existe um quiz preparado." }, { status: 500 });
  }
}
