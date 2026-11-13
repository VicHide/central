import sharp from "sharp";
import { larguraTexto, textoPath } from "./texto";

export type OpcoesTop10 = {
  fundo: string | Buffer; // imagem de fundo (capa do ranking ou imagem enviada)
  numero: number; // quantidade de animes do ranking
  destaque: string; // palavra em destaque na 1ª faixa (ex.: MELHOR)
  linha2: string; // faixa amarela grande (ex.: AVALIADOS)
  linha3: string; // faixa branca com texto vermelho (ex.: NO MUNDO)
};

const W = 1080, H = 1920;
const INK = "#0b0b12", AMARELO = "#ffe01a", VERMELHO = "#e8232a";
const F = "montserrat" as const;
const larg = (t: string, tam: number) => larguraTexto(t, tam, F);
const caminho = (t: string, x: number, y: number, tam: number) => textoPath(t, x, y, tam, F);
// Altura das maiúsculas (Montserrat ≈ 0.70 do tamanho): usada para centrar o texto na faixa.
const baseline = (centroY: number, tam: number) => centroY + tam * 0.35;

// Cabeçalho do ranking (O que diz a referência): "[10] ANIMES [MAIS]" / "ASSISTIDOS" / "NO MUNDO".
export async function comporTop10(o: OpcoesTop10): Promise<Buffer> {
  const fundo = await sharp(o.fundo).rotate().resize(W, H, { fit: "cover", position: "attention" })
    .modulate({ brightness: 0.9, saturation: 1.12 }).sharpen({ sigma: 1.1 }).png().toBuffer();

  // ---- faixa 1: círculo com o número + ANIMES + palavra destacada ----
  const num = String(o.numero);
  let k = 1;
  const medidas = (s: number) => {
    const d = 120 * s, gap = 24 * s, tam = 86 * s, pad = 26 * s;
    const wAnimes = larg("ANIMES", tam), wDest = o.destaque ? larg(o.destaque, tam) + pad * 2 : 0;
    return { d, gap, tam, pad, wAnimes, wDest, total: d + gap + wAnimes + (wDest ? gap + wDest : 0) };
  };
  let m = medidas(k);
  if (m.total > 860) { k = 860 / m.total; m = medidas(k); }
  const h1 = 160 * Math.max(k, 0.8), y1 = 1170;
  const w1 = m.total + 74;
  const x1 = (W - w1) / 2;
  let cursor = x1 + 37;
  const cyc = y1 + h1 / 2;
  const tNum = m.d * 0.6;
  const circulo = `<circle cx="${cursor + m.d / 2}" cy="${cyc}" r="${m.d / 2}" fill="${VERMELHO}" stroke="${INK}" stroke-width="5"/>
    <path d="${caminho(num, cursor + m.d / 2 - larg(num, tNum) / 2, baseline(cyc, tNum), tNum)}" fill="#fff"/>`;
  cursor += m.d + m.gap;
  const animes = `<path d="${caminho("ANIMES", cursor, baseline(cyc, m.tam), m.tam)}" fill="${INK}"/>`;
  cursor += m.wAnimes + m.gap;
  const pill = o.destaque
    ? `<rect x="${cursor}" y="${cyc - m.tam * 0.62}" width="${m.wDest}" height="${m.tam * 1.24}" rx="${14 * k}" fill="${AMARELO}"/>
       <path d="${caminho(o.destaque, cursor + m.pad, baseline(cyc, m.tam), m.tam)}" fill="${INK}"/>` : "";

  // ---- faixa 2: amarela, texto grande ----
  const tam2 = Math.min(176, 800 / (larg(o.linha2, 100) / 100));
  const w2 = Math.min(960, larg(o.linha2, tam2) + 110), h2 = 214, y2 = y1 + h1 - 16;
  const x2 = (W - w2) / 2;
  const t2 = `<path d="${caminho(o.linha2, W / 2 - larg(o.linha2, tam2) / 2, baseline(y2 + h2 / 2, tam2), tam2)}" fill="${INK}"/>`;

  // ---- faixa 3: branca, texto vermelho (se o texto for longo, quebra em duas linhas) ----
  const ajusta3 = (txt: string) => Math.min(122, 800 / (larg(txt, 100) / 100));
  let linhas3 = [o.linha3];
  if (ajusta3(o.linha3) < 78 && o.linha3.includes(" ")) {
    const palavras = o.linha3.split(" ");
    let melhor = 1, menorDif = Infinity;
    for (let i = 1; i < palavras.length; i++) {
      const dif = Math.abs(larg(palavras.slice(0, i).join(" "), 100) - larg(palavras.slice(i).join(" "), 100));
      if (dif < menorDif) { menorDif = dif; melhor = i; }
    }
    linhas3 = [palavras.slice(0, melhor).join(" "), palavras.slice(melhor).join(" ")];
  }
  const tam3 = Math.min(...linhas3.map(ajusta3), linhas3.length > 1 ? 96 : 122);
  const w3 = Math.min(960, Math.max(...linhas3.map((l) => larg(l, tam3))) + 120);
  const h3 = linhas3.length > 1 ? 250 : 160, y3 = y2 + h2 - 16;
  const x3 = (W - w3) / 2;
  const t3 = linhas3.map((l, i) => {
    const cy = y3 + (h3 / (linhas3.length * 2)) * (2 * i + 1);
    return `<path d="${caminho(l, W / 2 - larg(l, tam3) / 2, baseline(cy, tam3), tam3)}" fill="${VERMELHO}"/>`;
  }).join("");

  const faixa = (x: number, y: number, w: number, h: number, cor: string, raio: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${raio}" fill="${cor}" stroke="${INK}" stroke-width="7"/>`;

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05060b" stop-opacity=".30"/><stop offset=".22" stop-color="#05060b" stop-opacity="0"/>
        <stop offset=".52" stop-color="#05060b" stop-opacity="0"/><stop offset=".80" stop-color="#05060b" stop-opacity=".55"/>
        <stop offset="1" stop-color="#05060b" stop-opacity=".78"/>
      </linearGradient>
      <filter id="d" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#000" flood-opacity=".55"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sombra)"/>
    <g filter="url(#d)">${faixa(x1, y1, w1, h1, "#fff", 40)}</g>${circulo}${animes}${pill}
    <g filter="url(#d)">${faixa(x2, y2, w2, h2, AMARELO, 34)}</g>${t2}
    <g filter="url(#d)">${faixa(x3, y3, w3, h3, "#fff", 40)}</g>${t3}
  </svg>`);

  return sharp(fundo).composite([{ input: overlay }]).png().toBuffer();
}

// ---------- texto automático a partir de data/top.json ----------
const CRITERIOS: { chave: RegExp; destaque: string; linha2: string }[] = [
  { chave: /melhor avaliados/i, destaque: "MELHOR", linha2: "AVALIADOS" },
  { chave: /mais populares/i, destaque: "MAIS", linha2: "POPULARES" },
  { chave: /em alta agora/i, destaque: "EM ALTA", linha2: "AGORA" },
];
const ARTIGO_ESTACAO: Record<string, string> = { inverno: "NO INVERNO", primavera: "NA PRIMAVERA", verão: "NO VERÃO", verao: "NO VERÃO", outono: "NO OUTONO" };

// Deduz as três linhas do título a partir do título e do subtítulo gravados pelo comando `top`.
export function textoAutomatico(titulo: string, subtitulo: string) {
  const crit = CRITERIOS.find((c) => c.chave.test(subtitulo)) ?? { destaque: "MAIS", linha2: "ASSISTIDOS" };
  const nucleo = /ANIMES\s+(DE .+)$/i.exec(titulo.trim())?.[1]?.toUpperCase() ?? "";
  const periodo = subtitulo.split("·").map((p) => p.trim()).find((p) => /^(\d{4}|inverno|primavera|verão|verao|outono|a partir de|até)/i.test(p)) ?? "";
  let quando = "";
  const estacao = /^(inverno|primavera|verão|verao|outono)\s*(\d{4})?/i.exec(periodo);
  if (estacao) quando = `${ARTIGO_ESTACAO[estacao[1].toLowerCase()]}${estacao[2] ? " " + estacao[2] : ""}`;
  else if (/^\d{4}$/.test(periodo)) quando = `EM ${periodo}`;
  else if (/^\d{4} a \d{4}$/.test(periodo)) quando = `DE ${periodo.toUpperCase()}`;
  else if (periodo) quando = periodo.toUpperCase();
  const linha3 = [nucleo, quando].filter(Boolean).join(" ") || "NO MUNDO";
  return { destaque: crit.destaque, linha2: crit.linha2, linha3 };
}
