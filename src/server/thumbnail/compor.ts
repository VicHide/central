import sharp, { type OverlayOptions } from "sharp";
import { larguraTexto, textoPath } from "./texto";

export type Layout = "centro" | "lateral";
export type CorTexto = "ouro" | "branco" | "roxo" | "ciano";
export type Segmento = { texto: string; cor: CorTexto };
export type OpcoesThumb = {
  layout: Layout;
  cartoes: string[]; // 4 imagens (caminhos absolutos)
  personagem: string; // PNG com fundo transparente
  titulo: Segmento[][]; // linhas; cada linha tem segmentos (ex.: número em branco + palavra em ouro)
  seta: boolean;
  seed: number;
};

const W = 1280, H = 720;
const COR_NUMERO = ["#ff9a1f", "#1fa0ff", "#a05cff", "#ff4fa0"]; // 1 laranja, 2 azul, 3 roxo, 4 rosa
const PALETAS = [
  { a: "#22c1ff", b: "#0b4dff", c: "#8fefff" }, // azul vivo
  { a: "#ffb52e", b: "#ff5a1f", c: "#ffe28a" }, // laranja
  { a: "#a56bff", b: "#4a1fd0", c: "#dcc4ff" }, // roxo
  { a: "#21d9a8", b: "#0a8ad8", c: "#b2fff0" }, // verde-água
];
const GRAD_TEXTO: Record<CorTexto, [string, string, string]> = {
  ouro: ["#fff7a8", "#ffc61f", "#ff8a00"],
  branco: ["#ffffff", "#e9eeff", "#aab6e8"],
  roxo: ["#e2c4ff", "#a45cff", "#6a2bd8"],
  ciano: ["#c4fbff", "#35d3ff", "#1578ff"],
};
const INK = "#0b1030";

function rng(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const svg = (conteudo: string, w = W, h = H) => Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${conteudo}</svg>`);

// O sharp exige que cada camada caiba no canvas: recorta o que passa das bordas e ajusta a posição.
async function noCanvas(input: Buffer, left: number, top: number): Promise<OverlayOptions | null> {
  const m = await sharp(input).metadata();
  const w = m.width!, h = m.height!;
  const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(W, left + w), y1 = Math.min(H, top + h);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) return { input, left, top };
  const recortada = await sharp(input).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return { input: recortada, left: x0, top: y0 };
}

// ---------- fundo ----------
function fundo(p: (typeof PALETAS)[number], foco: { x: number; y: number }, rand: () => number) {
  const raios = Array.from({ length: 22 }, (_, i) => {
    const a1 = (i / 22) * Math.PI * 2, a2 = ((i + 0.5) / 22) * Math.PI * 2;
    return `<polygon points="${foco.x},${foco.y} ${foco.x + 1800 * Math.cos(a1)},${foco.y + 1800 * Math.sin(a1)} ${foco.x + 1800 * Math.cos(a2)},${foco.y + 1800 * Math.sin(a2)}" fill="#fff" opacity=".11"/>`;
  }).join("");
  const riscos = Array.from({ length: 5 }, () => {
    const x = Math.round(rand() * W), y = Math.round(rand() * H), l = 160 + Math.round(rand() * 220);
    return `<rect x="${x}" y="${y}" width="${l}" height="${6 + Math.round(rand() * 8)}" rx="4" fill="#fff" opacity=".35" transform="rotate(-38 ${x} ${y})"/>`;
  }).join("");
  return svg(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
    <radialGradient id="luz" cx="${foco.x / W}" cy="${foco.y / H}" r=".62"><stop offset="0" stop-color="${p.c}" stop-opacity=".85"/><stop offset="1" stop-color="${p.c}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vinheta" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
    <pattern id="pontos" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.6" fill="#fff"/></pattern>
    <linearGradient id="fade" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="mp"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${raios}
  <rect width="${W}" height="${H}" fill="url(#luz)"/>
  <rect width="${W}" height="${H}" fill="url(#pontos)" opacity=".30" mask="url(#mp)"/>${riscos}
  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>`);
}

// ---------- cartão com moldura ----------
async function cartao(arquivo: string, w: number, h: number, cor: string) {
  const foto = await sharp(arquivo).rotate().resize(w - 30, h - 30, { fit: "cover", position: "attention" }).png().toBuffer();
  const mascara = svg(`<rect x="0" y="0" width="${w - 30}" height="${h - 30}" rx="20" fill="#fff"/>`, w - 30, h - 30);
  const recortada = await sharp(foto).composite([{ input: mascara, blend: "dest-in" }]).png().toBuffer();
  const moldura = svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect x="15" y="15" width="${w - 30}" height="${h - 30}" rx="20" fill="url(#g)"/>
    <rect x="15" y="15" width="${w - 30}" height="${h - 30}" rx="20" fill="none" stroke="${INK}" stroke-opacity=".35" stroke-width="3"/>
    <rect x="9" y="9" width="${w - 18}" height="${h - 18}" rx="27" fill="none" stroke="#fff" stroke-width="13"/>
    <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="32" fill="none" stroke="${INK}" stroke-width="6"/>
    <rect x="15.5" y="15.5" width="${w - 31}" height="${h - 31}" rx="19.5" fill="none" stroke="${cor}" stroke-width="2.5" stroke-opacity=".9"/>`, w, h);
  const sombra = await sharp(svg(`<defs><filter id="b"><feGaussianBlur stdDeviation="9"/></filter></defs><rect x="30" y="38" width="${w - 6}" height="${h - 6}" rx="32" fill="#000" opacity=".5" filter="url(#b)"/>`, w + 60, h + 70)).png().toBuffer();
  const corpo = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: recortada, left: 15, top: 15 }, { input: moldura }]).png().toBuffer();
  return { corpo, sombra };
}

// ---------- texto grande (path) ----------
function gradId(cor: CorTexto, n: string) { return `g_${cor}_${n}`; }
function defsTexto(n: string) {
  return (Object.keys(GRAD_TEXTO) as CorTexto[]).map((c) => {
    const [a, b, d] = GRAD_TEXTO[c];
    return `<linearGradient id="${gradId(c, n)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${d}"/></linearGradient>`;
  }).join("");
}
function larguraLinha(seg: Segmento[], tam: number) { return seg.reduce((s, x) => s + larguraTexto(x.texto, tam), 0) + (seg.length - 1) * tam * 0.2; }

// Uma linha de título: sombra, contorno escuro, extrusão 3D e preenchimento em degradê.
function linhaTitulo(seg: Segmento[], cx: number, base: number, tam: number, n: string) {
  const total = larguraLinha(seg, tam);
  let x = cx - total / 2;
  const partes = seg.map((s) => {
    const d = textoPath(s.texto, x, base, tam);
    x += larguraTexto(s.texto, tam) + tam * 0.2;
    return { d, cor: s.cor };
  });
  const extrusao = Array.from({ length: 9 }, (_, k) => partes.map((p) => `<path d="${p.d}" transform="translate(0 ${k + 3})" fill="#1a0f3e" stroke="#1a0f3e" stroke-width="${tam * 0.2}" stroke-linejoin="round"/>`).join("")).join("");
  const contorno = partes.map((p) => `<path d="${p.d}" fill="${INK}" stroke="${INK}" stroke-width="${tam * 0.2}" stroke-linejoin="round"/>`).join("");
  const brilho = partes.map((p) => `<path d="${p.d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`).join("");
  const fill = partes.map((p) => `<path d="${p.d}" fill="url(#${gradId(p.cor, n)})"/>`).join("");
  return `<g filter="url(#sombraTxt)">${extrusao}</g>${contorno}${fill}${brilho}`;
}

// ---------- personagem ----------
type Personagem = { buf: Buffer; w: number; h: number; pad: number; tocaTopo: boolean; tocaBase: boolean };
export async function personagem(arquivo: string, alvoAltura: number): Promise<Personagem> {
  const base = sharp(arquivo).rotate().ensureAlpha();
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const { width: iw, height: ih } = info;
  let minX = iw, minY = ih, maxX = -1, maxY = -1, topo = 0, baseTocada = 0;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (data[(y * iw + x) * 4 + 3] > 24) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (y === 0) topo++; if (y === ih - 1) baseTocada++;
    }
  }
  if (maxX < 0) throw new Error("O PNG do personagem está totalmente transparente.");
  const tocaTopo = topo > iw * 0.04, tocaBase = baseTocada > iw * 0.04;
  const recorte = await base.clone().extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).resize({ height: alvoAltura }).png().toBuffer();
  const meta = await sharp(recorte).metadata();
  const w = meta.width!, h = meta.height!;
  const pad = 56;
  const pronto = await sharp(recorte).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const alfa = await sharp(pronto).extractChannel(3).toBuffer();
  // Expande a silhueta em r pixels: desfoque + corte (borda lisa e arredondada).
  // O sharp aplica as operações numa ordem fixa (o 2º blur sobrescreve o 1º), então cada etapa é um passo separado.
  const expande = async (r: number) => {
    const borrada = await sharp(alfa).blur(r * 0.6).toBuffer();
    const corte = await sharp(borrada).threshold(12).toBuffer();
    return sharp(corte).blur(0.8).toBuffer();
  };
  const [escuro, claro] = await Promise.all([expande(25), expande(17)]);
  const cor = async (mascara: Buffer, rgb: string) => sharp({ create: { width: w + pad * 2, height: h + pad * 2, channels: 3, background: rgb } }).joinChannel(mascara).png().toBuffer();
  const sombra = await sharp(escuro).blur(11).linear(0.5, 0).toBuffer();
  const camadas = [
    { input: await cor(sombra, "#000000"), left: 0, top: 12 },
    { input: await cor(escuro, INK), left: 0, top: 0 },
    { input: await cor(claro, "#ffffff"), left: 0, top: 0 },
    { input: pronto, left: 0, top: 0 },
  ];
  const buf = await sharp({ create: { width: w + pad * 2, height: h + pad * 2 + 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(camadas).png().toBuffer();
  return { buf, w, h, pad, tocaTopo, tocaBase };
}

// ---------- seta curva ----------
function seta(s: { x: number; y: number }, e: { x: number; y: number }, c: { x: number; y: number }) {
  const ang = Math.atan2(e.y - c.y, e.x - c.x);
  const L = 62, A = 44;
  const ponta = { x: e.x + Math.cos(ang) * 16, y: e.y + Math.sin(ang) * 16 };
  const b1 = { x: e.x - Math.cos(ang) * L + Math.cos(ang + Math.PI / 2) * A, y: e.y - Math.sin(ang) * L + Math.sin(ang + Math.PI / 2) * A };
  const b2 = { x: e.x - Math.cos(ang) * L + Math.cos(ang - Math.PI / 2) * A, y: e.y - Math.sin(ang) * L + Math.sin(ang - Math.PI / 2) * A };
  const haste = `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x - Math.cos(ang) * 18} ${e.y - Math.sin(ang) * 18}`;
  const cabeca = `${ponta.x},${ponta.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`;
  return `<g filter="url(#sombraSeta)">
    <path d="${haste}" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>
    <polygon points="${cabeca}" fill="${INK}" stroke="${INK}" stroke-width="26" stroke-linejoin="round"/>
    <path d="${haste}" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round"/>
    <polygon points="${cabeca}" fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>
    <path d="${haste}" fill="none" stroke="url(#ouroSeta)" stroke-width="30" stroke-linecap="round"/>
    <polygon points="${cabeca}" fill="url(#ouroSeta)"/></g>`;
}

export async function comporThumbnail(o: OpcoesThumb): Promise<Buffer> {
  const rand = rng(o.seed);
  const pal = PALETAS[Math.floor(rand() * PALETAS.length)];
  const centro = o.layout === "centro";

  // Cartões
  const g = centro
    ? { w: 455, h: 285, pos: [{ x: 22, y: 22 }, { x: W - 22 - 455, y: 22 }, { x: 22, y: H - 22 - 285 }, { x: W - 22 - 455, y: H - 22 - 285 }] }
    : { w: 372, h: 236, pos: [{ x: 22, y: 22 }, { x: 22 + 372 + 20, y: 22 }, { x: 22, y: 22 + 236 + 20 }, { x: 22 + 372 + 20, y: 22 + 236 + 20 }] };
  const camadas: OverlayOptions[] = [];
  const cartoes = await Promise.all(o.cartoes.slice(0, 4).map((f, i) => cartao(f, g.w, g.h, COR_NUMERO[i])));

  // Personagem (posição depende do layout e de o PNG ter o topo cortado)
  const p = await personagem(o.personagem, centro ? 640 : 800);
  let px: number, py: number;
  if (centro) {
    px = Math.round(W / 2 - (p.w + p.pad * 2) / 2);
    py = p.tocaTopo ? -p.pad : Math.round(H - 40 - p.h - p.pad);
  } else {
    px = Math.round(W - p.w * 0.8 - p.pad);
    py = p.tocaTopo ? -p.pad : Math.round(H + 70 - p.h - p.pad);
  }
  const figura = { x: px + p.pad, y: py + p.pad, w: p.w, h: p.h };

  const foco = { x: figura.x + figura.w / 2, y: figura.y + figura.h * 0.38 };
  camadas.push({ input: await sharp(fundo(pal, foco, rand)).png().toBuffer(), left: 0, top: 0 });
  for (const [i, c] of cartoes.entries()) {
    for (const l of [await noCanvas(c.sombra, g.pos[i].x - 30, g.pos[i].y - 24), await noCanvas(c.corpo, g.pos[i].x, g.pos[i].y)]) if (l) camadas.push(l);
  }

  // Números, seta, "?" e título em SVG
  const n = "t";
  const medalhas = cartoes.map((_, i) => {
    const direita = i % 2 === 1;
    const cx = direita ? g.pos[i].x + g.w - 30 : g.pos[i].x + 30;
    const cy = g.pos[i].y + 32;
    const tam = 56, d = textoPath(String(i + 1), 0, 0, tam), larg = larguraTexto(String(i + 1), tam);
    return `<g filter="url(#sombraSeta)"><circle cx="${cx}" cy="${cy}" r="46" fill="${INK}"/><circle cx="${cx}" cy="${cy}" r="40" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="33" fill="${COR_NUMERO[i]}"/>
      <ellipse cx="${cx - 6}" cy="${cy - 16}" rx="20" ry="9" fill="#fff" opacity=".4"/>
      <g transform="translate(${cx - larg / 2} ${cy + 20})"><path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/><path d="${d}" fill="#fff"/></g></g>`;
  }).join("");

  let setaSvg = "";
  if (o.seta) {
    const alvos = centro ? [0, 1, 2, 3] : [1, 3]; // no layout lateral só a coluna da direita fica ao alcance
    const i = alvos[Math.floor(rand() * alvos.length)];
    const noLadoDireito = i % 2 === 1;
    const cy = g.pos[i].y + g.h * (i < 2 ? 0.72 : 0.36); // longe da medalha do canto
    let fim = centro
      ? { x: g.pos[i].x + (noLadoDireito ? 120 : g.w - 120), y: cy }
      : { x: g.pos[i].x + g.w - 105, y: cy };
    const ini = centro
      ? { x: figura.x + figura.w * (noLadoDireito ? 0.97 : 0.03), y: figura.y + figura.h * 0.50 }
      : { x: figura.x + figura.w * 0.07, y: figura.y + figura.h * 0.50 };
    // Seta curta demais some atrás do personagem: garante um comprimento mínimo.
    { const d0 = Math.hypot(fim.x - ini.x, fim.y - ini.y); if (d0 < 230) fim = { x: ini.x + ((fim.x - ini.x) / (d0 || 1)) * 230, y: ini.y + ((fim.y - ini.y) / (d0 || 1)) * 230 }; }
    // Curva: o ponto de controle sai do meio do trajeto, na perpendicular, para o lado de cima.
    const dx = fim.x - ini.x, dy = fim.y - ini.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, sinal = ny < 0 ? 1 : -1;
    const ctrl = { x: (ini.x + fim.x) / 2 + nx * sinal * len * 0.3, y: (ini.y + fim.y) / 2 + ny * sinal * len * 0.3 };
    setaSvg = seta(ini, fim, ctrl);
  }

  const interrog = centro
    ? { x: Math.min(figura.x + figura.w * 0.92, W - 150), y: Math.max(figura.y + 50, 110) }
    : { x: Math.max(figura.x + 70, 900), y: Math.max(figura.y + 130, 140) };
  const dq = textoPath("?", 0, 0, 200), lq = larguraTexto("?", 200);
  const pontoInterrogacao = `<g transform="translate(${interrog.x - lq / 2} ${interrog.y + 70}) rotate(10 ${lq / 2} -70)" filter="url(#sombraSeta)">
    <path d="${dq}" fill="${INK}" stroke="${INK}" stroke-width="44" stroke-linejoin="round"/><path d="${dq}" fill="#fff" stroke="#fff" stroke-width="26" stroke-linejoin="round"/><path d="${dq}" fill="url(#${gradId("ouro", n)})"/></g>`;

  // Título: ajusta o tamanho para caber na área livre do layout
  const linhas = o.titulo;
  const areaW = centro ? 640 : 800, cx = centro ? W / 2 : 22 + 392;
  const tam = Math.min(centro ? 120 : 150, ...linhas.map((l) => (areaW / larguraLinha(l, 100)) * 100));
  const alt = linhas.length === 1 ? [centro ? 690 : 678] : [centro ? 612 : 584, centro ? 700 : 688];
  const tituloSvg = linhas.map((l, i) => linhaTitulo(l, cx, alt[i] ?? alt[alt.length - 1], i === 0 && linhas.length > 1 ? tam * 0.9 : tam, n)).join("");

  const defs = `<defs>${defsTexto(n)}
    <linearGradient id="ouroSeta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff27a"/><stop offset="1" stop-color="#ff9d1c"/></linearGradient>
    <filter id="sombraTxt" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="sombraSeta" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".45"/></filter></defs>`;

    const camadaPersonagem = await noCanvas(p.buf, px, py);
  if (camadaPersonagem) camadas.push(camadaPersonagem);
  // A seta fica abaixo das medalhas, para nenhum número ficar escondido.
  camadas.push({ input: svg(`${defs}${setaSvg}${medalhas}${pontoInterrogacao}${tituloSvg}`), left: 0, top: 0 });

  return sharp({ create: { width: W, height: H, channels: 4, background: pal.b } }).composite(camadas).png().toBuffer();
}

// Diz se o recorte toca a borda de cima (ex.: cabelo cortado). Lê uma miniatura, então é rápido.
const cacheAnalise = new Map<string, boolean>();
export async function pngTocaTopo(arquivo: string, mtime: number): Promise<boolean> {
  const chave = `${arquivo}|${mtime}`;
  const guardado = cacheAnalise.get(chave);
  if (guardado !== undefined) return guardado;
  const { data, info } = await sharp(arquivo).rotate().ensureAlpha().resize({ width: 240, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let x = 0; x < info.width; x++) if (data[x * 4 + 3] > 24) n++;
  const r = n > info.width * 0.04;
  cacheAnalise.set(chave, r);
  return r;
}
