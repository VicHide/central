import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { randomInt } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Registro = {
  anime?: string;
  capa?: string | null;
  imagem?: string | null;
  imagens?: string[];
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

function pngAleatorio(): string | null {
  if (!fs.existsSync(pastaPngs)) return null;
  const arquivos = fs.readdirSync(pastaPngs, { withFileTypes: true })
    .filter((item) => item.isFile() && /\.png$/i.test(item.name))
    .map((item) => path.join(pastaPngs, item.name));
  return arquivos.length ? arquivos[randomInt(arquivos.length)] : null;
}

async function imagemCartao(arquivo: string, numero: number, tamanho: number, rotacao: number) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(tamanho, tamanho, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  const arte = Buffer.from(`<svg width="${tamanho}" height="${tamanho}" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="${tamanho - 6}" height="${tamanho - 6}" rx="22" fill="none" stroke="#101820" stroke-width="14"/>
    <rect x="9" y="9" width="${tamanho - 18}" height="${tamanho - 18}" rx="17" fill="none" stroke="#fff" stroke-width="5"/>
    <rect x="18" y="18" width="66" height="66" rx="17" fill="#e52b36" stroke="#111" stroke-width="5"/>
    <text x="51" y="66" text-anchor="middle" font-family="Arial Rounded MT Bold,DejaVu Sans,sans-serif" font-size="43" font-weight="900" fill="#fff" stroke="#111" stroke-width="1.5" paint-order="stroke">${numero}</text>
  </svg>`);

  const cartao = await sharp(imagem).composite([{ input: arte }]).png().toBuffer();
  return sharp(cartao)
    .rotate(rotacao, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function sombraCartao(tamanho: number, rotacao: number) {
  const centro = tamanho / 2 + 18;
  return Buffer.from(`<svg width="${tamanho + 36}" height="${tamanho + 36}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feGaussianBlur stdDeviation="16"/></filter></defs>
    <rect x="18" y="18" width="${tamanho}" height="${tamanho}" rx="22" fill="#07111d" opacity=".82" filter="url(#s)" transform="rotate(${rotacao} ${centro} ${centro})"/>
  </svg>`);
}

async function pngComContorno(arquivo: string) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(520, 520, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = Buffer.from(`<svg width="560" height="560" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="outline" x="-25%" y="-25%" width="150%" height="150%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="13" result="outer"/>
        <feFlood flood-color="#101820" result="darkColor"/>
        <feComposite in="darkColor" in2="outer" operator="in" result="darkStroke"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="7" result="inner"/>
        <feFlood flood-color="#ffffff" result="lightColor"/>
        <feComposite in="lightColor" in2="inner" operator="in" result="lightStroke"/>
        <feMerge><feMergeNode in="darkStroke"/><feMergeNode in="lightStroke"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <image x="20" y="20" width="520" height="520" href="data:image/png;base64,${imagem.toString("base64")}" filter="url(#outline)"/>
  </svg>`);

  return sharp(svg).png().toBuffer();
}

export async function POST() {
  try {
    const arquivoPng = pngAleatorio();
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

    const candidatos = dados.map((registro) => ({
      arquivo: arquivoPublico(modo === "zoom" ? registro.imagem : registro.capa) ??
        arquivoPublico(registro.imagens?.[0]),
    })).filter((item): item is { arquivo: string } => Boolean(item.arquivo));

    if (candidatos.length < 4) {
      return Response.json({ erro: "Encontrei menos de 4 animes com imagens válidas no último quiz." }, { status: 422 });
    }

    const sorteados = embaralha(candidatos).slice(0, 4);
    const tamanho = 360;
    const cartoes = [
      { x: 25, y: 105, rotulo: 1, rotacao: -7 },
      { x: 895, y: 105, rotulo: 2, rotacao: 6 },
      { x: 25, y: 330, rotulo: 3, rotacao: 5 },
      { x: 895, y: 330, rotulo: 4, rotacao: -6 },
    ];

    const base = sharp({ create: { width: 1280, height: 720, channels: 4, background: "#00bfe9" } });
    const camadas: sharp.OverlayOptions[] = [];

    for (let i = 0; i < cartoes.length; i++) {
      const q = cartoes[i];
      camadas.push({ input: sombraCartao(tamanho, q.rotacao), left: q.x - 18, top: q.y - 18 });
      const cartao = await imagemCartao(sorteados[i].arquivo, q.rotulo, tamanho, q.rotacao);
      const meta = await sharp(cartao).metadata();
      const largura = meta.width ?? tamanho;
      const altura = meta.height ?? tamanho;
      camadas.push({
        input: cartao,
        left: Math.round(q.x + (tamanho - largura) / 2),
        top: Math.round(q.y + (tamanho - altura) / 2),
      });
    }

    const pngCentral = await pngComContorno(arquivoPng);
    camadas.push({ input: pngCentral, left: 360, top: 145 });

    const detalhes = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <text x="640" y="112" text-anchor="middle" font-family="Arial Rounded MT Bold,DejaVu Sans,sans-serif" font-size="66" font-weight="900" letter-spacing="-2" fill="#fff" stroke="#101820" stroke-width="16" stroke-linejoin="round" paint-order="stroke">${dados.length} ANIMES</text>
    </svg>`;

    const png = await base.composite([...camadas, { input: Buffer.from(detalhes) }]).png().toBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="thumbnail-quiz.png"',
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail. Confira se existe um quiz preparado." }, { status: 500 });
  }
}
