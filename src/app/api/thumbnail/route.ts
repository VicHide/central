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
const raizPublica = path.resolve(process.cwd(), "public");

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

async function imagemArredondada(arquivo: string, largura: number, altura: number) {
  const mascara = Buffer.from(
    `<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="22" fill="white"/></svg>`,
  );
  return sharp(arquivo)
    .rotate()
    .resize(largura, altura, { fit: "cover", position: "top" })
    .composite([{ input: mascara, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function moldura(x: number, y: number, w: number, h: number, rotulo: string) {
  const larguras: Record<string, number> = {
    HARD: 105,
    MEDIUM: 145,
    EASY: 95,
    "VERY EASY": 170,
  };
  const larguraRotulo = larguras[rotulo] ?? Math.max(100, rotulo.length * 14 + 30);
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="23" fill="none" stroke="#101820" stroke-width="15"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="23" fill="none" stroke="#fff" stroke-width="8"/><rect x="${x + 9}" y="${y + 9}" width="${larguraRotulo}" height="43" rx="19" fill="#e52b36" stroke="#111" stroke-width="4"/><text x="${x + 24}" y="${y + 39}" font-family="Arial, sans-serif" font-size="27" font-weight="900" fill="#fff" stroke="#111" stroke-width="1.5" paint-order="stroke">${rotulo}</text></g>`;
}

export async function POST() {
  try {
    const intro = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "intro.json"), "utf8")) as { modo?: string };
    const modo = intro.modo === "zoom" ? "zoom" : "quatro";
    const nomeArquivo = modo === "zoom" ? "zoom.json" : "perguntas.json";
    const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", nomeArquivo), "utf8")) as Registro[];
    if (!Array.isArray(dados) || dados.length < 5) {
      return Response.json({ erro: "O último quiz precisa ter pelo menos 5 animes para montar quatro quadros e um destaque diferente." }, { status: 422 });
    }

    const candidatos = dados.map((registro) => ({
      anime: registro.anime?.trim() || "Anime",
      arquivo: arquivoPublico(modo === "zoom" ? registro.imagem : registro.capa) ??
        arquivoPublico(registro.imagens?.[0]),
    })).filter((item): item is { anime: string; arquivo: string } => Boolean(item.arquivo));

    if (candidatos.length < 5) {
      return Response.json({ erro: "Encontrei menos de 5 animes com imagens válidas no último quiz. Gere o vídeo novamente ou confira as capas em public/gerado/." }, { status: 422 });
    }

    const sorteados = embaralha(candidatos).slice(0, 5);
    const quadros = [
      { x: 18, y: 18, w: 378, h: 270, rotulo: "HARD" },
      { x: 412, y: 18, w: 378, h: 270, rotulo: "MEDIUM" },
      { x: 18, y: 306, w: 378, h: 270, rotulo: "EASY" },
      { x: 412, y: 306, w: 378, h: 270, rotulo: "VERY EASY" },
    ];
    const composicoes = await Promise.all([
      ...sorteados.slice(0, 4).map((item, i) => imagemArredondada(item.arquivo, quadros[i].w, quadros[i].h)),
      imagemArredondada(sorteados[4].arquivo, 456, 590),
    ]);

    const base = sharp({ create: { width: 1280, height: 720, channels: 4, background: "#00bfe9" } });
    const camadas: sharp.OverlayOptions[] = [];
    quadros.forEach((q, i) => {
      camadas.push({ input: composicoes[i], left: q.x, top: q.y });
    });
    camadas.push({ input: composicoes[4], left: 806, top: 12 });

    const detalhes = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sombra" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <path d="M0 590H1280V720H0Z" fill="#07111d" opacity=".78"/>
      ${quadros.map((q) => moldura(q.x, q.y, q.w, q.h, q.rotulo)).join("")}
      <rect x="806" y="12" width="456" height="590" rx="23" fill="none" stroke="#101820" stroke-width="15"/>
      <rect x="806" y="12" width="456" height="590" rx="23" fill="none" stroke="#fff" stroke-width="8"/>
      <path d="M1088 15 C1160 -5 1265 8 1270 88 L1270 172 C1225 175 1185 147 1150 115Z" fill="#fff" stroke="#111" stroke-width="13"/>
      <text x="1174" y="133" text-anchor="middle" font-family="Arial,sans-serif" font-size="116" font-weight="900" fill="#111">?</text>
      <text x="28" y="690" font-family="Arial,sans-serif" font-size="100" font-weight="1000" letter-spacing="-5" fill="#f7c642" stroke="#111" stroke-width="15" paint-order="stroke"> ${dados.length} </text>
      <text x="280" y="690" font-family="Arial,sans-serif" font-size="88" font-weight="1000" letter-spacing="-4" fill="#fff" stroke="#111" stroke-width="15" paint-order="stroke">ANIMES</text>
      <rect x="1180" y="682" width="78" height="26" rx="5" fill="#111" opacity=".88"/>
      <text x="1219" y="701" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#fff">QUIZ</text>
    </svg>`;
    const svg = Buffer.from(detalhes);
    const png = await base.composite([...camadas, { input: svg }]).png().toBuffer();
    return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="thumbnail-quiz.png"' } });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail. Confira se existe um quiz preparado." }, { status: 500 });
  }
}
