import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import {
  comporThumbnail,
  pngTocaTopo,
  type Layout,
  type Segmento,
} from "@/server/thumbnail/compor";

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
  if (!absoluto.startsWith(raizPublica + path.sep) || !fs.existsSync(absoluto))
    return null;
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
  const arquivos = fs
    .readdirSync(pastaPngs, { withFileTypes: true })
    .filter((item) => item.isFile() && /\.png$/i.test(item.name))
    .map((item) => path.join(pastaPngs, item.name));
  if (arquivos.length === 0) return null;
  const cortados: string[] = [],
    inteiros: string[] = [];
  for (const f of arquivos) {
    try {
      ((await pngTocaTopo(f, fs.statSync(f).mtimeMs))
        ? cortados
        : inteiros
      ).push(f);
    } catch {
      inteiros.push(f);
    }
  }
  const preferidos =
    layout === "lateral"
      ? cortados.length && randomInt(10) < 7
        ? cortados
        : arquivos
      : inteiros.length
        ? inteiros
        : arquivos;
  return preferidos[randomInt(preferidos.length)];
}

const PNG_ASSINATURA = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const LIMITE_UPLOAD = 10 * 1024 * 1024;

// Aceita JSON (como antes) ou multipart/form-data (quando há PNG enviado).
async function lerPedido(req: Request) {
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) {
    const f = await req.formData();
    const arq = f.get("personagem");
    const texto = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" ? v : undefined;
    };
    return {
      layout: texto("layout"),
      seta: texto("seta"),
      tema: texto("tema"),
      arquivo: arq && typeof arq !== "string" && arq.size > 0 ? arq : null,
    };
  }
  const j = (await req.json().catch(() => ({}))) as {
    layout?: unknown;
    seta?: unknown;
    tema?: unknown;
  };
  return {
    layout: j.layout,
    seta: j.seta,
    tema: j.tema,
    arquivo: null as File | null,
  };
}

// "auto" | "off" | 1..4 (ou o booleano antigo). Devolve null se for inválido.
function lerSeta(v: unknown): "auto" | "off" | number | null {
  if (v === undefined || v === "" || v === "auto" || v === true) return "auto";
  if (v === "off" || v === false) return "off";
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : null;
}

export async function POST(req: Request) {
  try {
    const corpo = await lerPedido(req);
    const layout: Layout | null =
      corpo.layout === undefined || corpo.layout === "centro"
        ? "centro"
        : corpo.layout === "lateral"
          ? "lateral"
          : null;
    if (!layout)
      return Response.json(
        { erro: "Layout inválido. Use centro ou lateral." },
        { status: 400 },
      );
    const seta = lerSeta(corpo.seta);
    if (seta === null)
      return Response.json(
        {
          erro: "Seta inválida. Use automática, sem seta ou um quadro de 1 a 4.",
        },
        { status: 400 },
      );
    const tema =
      typeof corpo.tema === "string" ? corpo.tema.trim().toUpperCase() : "";
    if (tema && !/^[A-ZÀ-Ý0-9 ]{1,18}$/.test(tema)) {
      return Response.json(
        {
          erro: "O tema aceita só letras, números e espaços (até 18 caracteres).",
        },
        { status: 400 },
      );
    }

    // Personagem: o PNG enviado tem prioridade; sem ele, sorteia de acervo/pngs.
    let personagem: string | Buffer | null = null;
    if (corpo.arquivo) {
      if (corpo.arquivo.size > LIMITE_UPLOAD)
        return Response.json(
          { erro: "O PNG passa de 10 MB. Envie um arquivo menor." },
          { status: 400 },
        );
      const buf = Buffer.from(await corpo.arquivo.arrayBuffer());
      if (!buf.subarray(0, 8).equals(PNG_ASSINATURA))
        return Response.json(
          {
            erro: "O arquivo enviado não é um PNG. Envie um PNG com fundo transparente.",
          },
          { status: 400 },
        );
      personagem = buf;
    } else {
      personagem = await escolhePng(layout);
    }
    if (!personagem) {
      return Response.json(
        {
          erro: "Não encontrei PNGs em acervo/pngs. Adicione um PNG nessa pasta ou envie um pelo painel.",
        },
        { status: 422 },
      );
    }

    const intro = JSON.parse(
      fs.readFileSync(path.join(raiz, "data", "intro.json"), "utf8"),
    ) as { modo?: string };
    const modo = intro.modo === "zoom" ? "zoom" : "quatro";
    const nomeArquivo = modo === "zoom" ? "zoom.json" : "perguntas.json";
    const dados = JSON.parse(
      fs.readFileSync(path.join(raiz, "data", nomeArquivo), "utf8"),
    ) as Registro[];
    if (!Array.isArray(dados) || dados.length < 4) {
      return Response.json(
        {
          erro: "O último quiz precisa ter pelo menos 4 animes para montar a thumbnail.",
        },
        { status: 422 },
      );
    }

    // Cada cartão mostra uma cena do anime; se não houver, usa a capa.
    const candidatos = dados
      .map((registro) => {
        const cenas =
          modo === "zoom" ? [registro.imagem] : (registro.imagens ?? []);
        const arquivos = cenas
          .map(arquivoPublico)
          .filter((f): f is string => Boolean(f));
        return arquivos.length
          ? arquivos[randomInt(arquivos.length)]
          : arquivoPublico(registro.capa);
      })
      .filter((f): f is string => Boolean(f));
    if (candidatos.length < 4) {
      return Response.json(
        {
          erro: "Encontrei menos de 4 animes com imagens válidas no último quiz.",
        },
        { status: 422 },
      );
    }

    const titulo: Segmento[][] = [
      [
        { texto: String(dados.length), cor: "branco" },
        { texto: "ANIMES", cor: "ouro" },
      ],
    ];
    if (tema) titulo.push([{ texto: tema, cor: "roxo" }]);

    const png = await comporThumbnail({
      layout,
      cartoes: embaralha(candidatos).slice(0, 4),
      personagem,
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
    const msg = erro instanceof Error ? erro.message : "";
    if (msg === "PNG_SEM_TRANSPARENCIA")
      return Response.json(
        {
          erro: "Esse PNG não tem fundo transparente (o personagem precisa estar recortado). Remova o fundo e envie de novo.",
        },
        { status: 422 },
      );
    if (msg === "PNG_DIMENSOES_INVALIDAS")
      return Response.json(
        {
          erro: "A imagem possui dimensões inválidas ou excede o limite de 40 milhões de pixels.",
        },
        { status: 422 },
      );
    if (msg === "PNG_VAZIO")
      return Response.json(
        { erro: "Esse PNG está totalmente transparente." },
        { status: 422 },
      );
    console.error("Erro ao gerar thumbnail:", erro);
    return Response.json(
      {
        erro: "Não foi possível gerar a thumbnail. Confira se existe um quiz preparado.",
      },
      { status: 500 },
    );
  }
}
