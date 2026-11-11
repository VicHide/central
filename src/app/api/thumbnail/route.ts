import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { randomInt } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Registro = {
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

async function imagemCartao(arquivo: string, largura: number, altura: number, cor: string) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();

  const moldura = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="${largura - 8}" height="${altura - 8}" rx="30" fill="none" stroke="#111827" stroke-width="18"/>
    <rect x="7" y="7" width="${largura - 14}" height="${altura - 14}" rx="27" fill="none" stroke="#fff" stroke-width="13"/>
    <rect x="14" y="14" width="${largura - 28}" height="${altura - 28}" rx="21" fill="none" stroke="${cor}" stroke-width="7"/>
  </svg>`);
  return sharp(imagem).composite([{ input: moldura }]).png().toBuffer();
}

async function pngComContorno(arquivo: string) {
  const imagem = await sharp(arquivo)
    .rotate()
    .resize(570, 570, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const svg = Buffer.from(`<svg width="630" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="outline" x="-25%" y="-25%" width="150%" height="150%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="16" result="outer"/>
        <feFlood flood-color="#111827" result="dark"/>
        <feComposite in="dark" in2="outer" operator="in" result="darkStroke"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="8" result="inner"/>
        <feFlood flood-color="#fff" result="light"/>
        <feComposite in="light" in2="inner" operator="in" result="lightStroke"/>
        <feMerge><feMergeNode in="darkStroke"/><feMergeNode in="lightStroke"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <image x="30" y="30" width="570" height="570" href="data:image/png;base64,${imagem.toString("base64")}" filter="url(#outline)"/>
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
    const altura = 300;
    const cartoes = [
      { x: 24, y: 24, cor: "#ff9c32" },
      { x: 666, y: 24, cor: "#19d4e8" },
      { x: 24, y: 396, cor: "#a879ff" },
      { x: 666, y: 396, cor: "#ff4d88" },
    ];

    const fundo = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ff4f87"/><stop offset=".28" stop-color="#ff9d35"/><stop offset=".58" stop-color="#7358e8"/><stop offset=".82" stop-color="#16b9d4"/><stop offset="1" stop-color="#25d6a2"/>
        </linearGradient>
        <radialGradient id="glow"><stop stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <pattern id="grain" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.6" fill="#fff" opacity=".2"/></pattern>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <ellipse cx="640" cy="340" rx="680" ry="480" fill="url(#glow)"/>
      <g fill="none" stroke="#fff" stroke-width="17" stroke-linecap="square" opacity=".96">
        <path d="M-120 115 L250 -80 M-90 180 L315 -35 M1010 805 L1390 425 M950 790 L1330 410"/>
        <path d="M520 -90 L700 90 M580 -110 L760 70 M-80 570 L70 720 M-20 545 L125 690" stroke-width="11"/>
      </g>
      <g fill="#fff" opacity=".94">
        <path d="M0 330 L0 365 L250 115 L215 115 Z"/>
        <path d="M1030 720 L1065 720 L1280 505 L1280 470 Z"/>
        <circle cx="640" cy="360" r="7"/><circle cx="670" cy="360" r="7"/><circle cx="700" cy="360" r="7"/>
      </g>
      <rect width="1280" height="720" fill="url(#grain)"/>
    </svg>`);

    const camadas: OverlayOptions[] = [{ input: fundo, left: 0, top: 0 }];
    for (let i = 0; i < cartoes.length; i++) {
      const q = cartoes[i];
      camadas.push({
        input: await imagemCartao(sorteados[i].arquivo, largura, altura, q.cor),
        left: q.x,
        top: q.y,
      });
    }

    // O personagem fica acima dos quatro quadros, como elemento principal da composição.
    const pngCentral = await pngComContorno(arquivoPng);
    camadas.push({ input: pngCentral, left: 325, top: 58 });

    const elementos = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="yellow" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff36a"/><stop offset="1" stop-color="#ffad16"/></linearGradient>
        <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1ff0f0"/><stop offset="1" stop-color="#168bff"/></linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <ellipse cx="640" cy="616" rx="300" ry="32" fill="#000" opacity=".45" filter="url(#shadow)"/>
      <path d="M770 250 Q830 210 865 165" fill="none" stroke="#101827" stroke-width="34" stroke-linecap="round"/>
      <path d="M770 250 Q830 210 865 165" fill="none" stroke="url(#cyan)" stroke-width="21" stroke-linecap="round"/>
      <path d="M836 166 L879 150 L872 195" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="900" cy="112" r="48" fill="#f33c69" stroke="#fff" stroke-width="9"/>
      <text x="900" y="137" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="72" font-weight="900" fill="#fff" stroke="#a81745" stroke-width="3" paint-order="stroke">?</text>
      <rect x="330" y="574" width="620" height="112" rx="28" fill="#101827" stroke="#fff" stroke-width="8"/>
      <rect x="342" y="586" width="596" height="88" rx="19" fill="#202d4d"/>
      <text x="640" y="650" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="62" font-weight="1000" letter-spacing="-2" fill="url(#yellow)" stroke="#080d19" stroke-width="15" stroke-linejoin="round" paint-order="stroke">ANIME QUIZ</text>
      <rect x="1010" y="610" width="220" height="62" rx="20" fill="#fff" stroke="#111827" stroke-width="7"/>
      <text x="1120" y="652" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="30" font-weight="900" fill="#e33b59">${dados.length} ANIMES</text>
    </svg>`);

    const png = await sharp({ create: { width: 1280, height: 720, channels: 4, background: "#101a32" } })
      .composite([...camadas, { input: elementos }])
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
