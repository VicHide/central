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

async function imagemCartao(
  arquivo: string,
  numero: number,
  largura: number,
  altura: number,
  cor: string,
  numeroNaDireita: boolean,
) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  // Recorta a própria imagem com o mesmo raio dos quadros para impedir vazamento nos cantos.
  const mascara = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${largura}" height="${altura}" rx="28" fill="#fff"/>
  </svg>`);
  const imagemRecortada = await sharp(imagem)
    .composite([{ input: mascara, blend: "dest-in" }])
    .png()
    .toBuffer();

  const cx = numeroNaDireita ? largura - 48 : 48;
  const arte = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="${largura - 6}" height="${altura - 6}" rx="32" fill="none" stroke="#101820" stroke-width="18"/>
    <rect x="9" y="9" width="${largura - 18}" height="${altura - 18}" rx="27" fill="none" stroke="${cor}" stroke-width="9"/>
    <rect x="17" y="17" width="${largura - 34}" height="${altura - 34}" rx="22" fill="none" stroke="#fff" stroke-width="4"/>
    <circle cx="${cx}" cy="48" r="38" fill="#ed174c" stroke="#fff" stroke-width="8"/>
    <circle cx="${cx}" cy="48" r="33" fill="none" stroke="#111" stroke-width="4"/>
    <text x="${cx}" y="63" text-anchor="middle" font-family="Arial Rounded MT Bold,DejaVu Sans,sans-serif" font-size="42" font-weight="900" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke">${numero}</text>
  </svg>`);

  return sharp(imagemRecortada).composite([{ input: arte }]).png().toBuffer();
}

function sombraCartao(largura: number, altura: number) {
  return Buffer.from(`<svg width="${largura + 48}" height="${altura + 48}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s"><feGaussianBlur stdDeviation="18"/></filter></defs>
    <rect x="24" y="24" width="${largura}" height="${altura}" rx="34" fill="#000" opacity=".9" filter="url(#s)"/>
  </svg>`);
}

async function pngComContorno(arquivo: string) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(570, 570, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = Buffer.from(`<svg width="610" height="610" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="outline" x="-25%" y="-25%" width="150%" height="150%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="15" result="outer"/>
        <feFlood flood-color="#101820" result="darkColor"/>
        <feComposite in="darkColor" in2="outer" operator="in" result="darkStroke"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="8" result="inner"/>
        <feFlood flood-color="#ffffff" result="lightColor"/>
        <feComposite in="lightColor" in2="inner" operator="in" result="lightStroke"/>
        <feMerge><feMergeNode in="darkStroke"/><feMergeNode in="lightStroke"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <image x="20" y="20" width="570" height="570" href="data:image/png;base64,${imagem.toString("base64")}" filter="url(#outline)"/>
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
    const largura = 590;
    const altura = 290;
    const cartoes = [
      { x: 25, y: 22, numero: 1, cor: "#f21d50", numeroNaDireita: false },
      { x: 665, y: 22, numero: 2, cor: "#a52bff", numeroNaDireita: true },
      { x: 25, y: 365, numero: 3, cor: "#ffb21c", numeroNaDireita: false },
      { x: 665, y: 365, numero: 4, cor: "#20c8ed", numeroNaDireita: true },
    ];

    const fundo = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#101522"/>
          <stop offset=".5" stop-color="#21152e"/>
          <stop offset="1" stop-color="#071a25"/>
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0" stop-color="#572b83" stop-opacity=".75"/>
          <stop offset="1" stop-color="#101522" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <ellipse cx="640" cy="350" rx="620" ry="430" fill="url(#glow)"/>
      <rect x="8" y="8" width="1264" height="704" rx="34" fill="none" stroke="#05070d" stroke-width="16"/>
      <rect x="14" y="14" width="1252" height="692" rx="29" fill="none" stroke="#f2f2f2" stroke-width="5"/>
    </svg>`);

    const camadas: sharp.OverlayOptions[] = [{ input: fundo, left: 0, top: 0 }];

    for (let i = 0; i < cartoes.length; i++) {
      const q = cartoes[i];
      camadas.push({ input: sombraCartao(largura, altura), left: q.x - 24, top: q.y - 24 });
      camadas.push({
        input: await imagemCartao(sorteados[i].arquivo, q.numero, largura, altura, q.cor, q.numeroNaDireita),
        left: q.x,
        top: q.y,
      });
    }

    const pngCentral = await pngComContorno(arquivoPng);
    camadas.push({ input: pngCentral, left: 335, top: 72 });

    const titulo = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff56a"/>
          <stop offset=".45" stop-color="#ffb900"/>
          <stop offset="1" stop-color="#f06a00"/>
        </linearGradient>
      </defs>
      <text x="640" y="625" text-anchor="middle" font-family="Arial Rounded MT Bold,DejaVu Sans,sans-serif" font-size="112" font-weight="1000" letter-spacing="-5" fill="url(#gold)" stroke="#080808" stroke-width="25" stroke-linejoin="round" paint-order="stroke">${dados.length}</text>
      <text x="640" y="704" text-anchor="middle" font-family="Arial Rounded MT Bold,DejaVu Sans,sans-serif" font-size="76" font-weight="1000" letter-spacing="-3" fill="#fff" stroke="#080808" stroke-width="22" stroke-linejoin="round" paint-order="stroke">ANIMES</text>
    </svg>`);

    const png = await sharp({ create: { width: 1280, height: 720, channels: 4, background: "#101522" } })
      .composite([...camadas, { input: titulo }])
      .png()
      .toBuffer();

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
