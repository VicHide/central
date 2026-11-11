import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TopItem = { rank: number; titulo: string; nota?: number; capa?: string | null };
type TopData = { titulo?: string[]; subtitulo?: string; itens?: TopItem[] };

const raiz = process.cwd();
const pastaPublica = path.resolve(raiz, "public");

function arquivoCapa(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const relativo = valor.replace(/^\/+/, "").replace(/^public\//, "");
  const absoluto = path.resolve(pastaPublica, relativo);
  if (!absoluto.startsWith(pastaPublica + path.sep) || !fs.existsSync(absoluto)) return null;
  return absoluto;
}

function escaparSvg(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function linhasTitulo(texto: string, max = 20) {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const teste = atual ? atual + " " + palavra : palavra;
    if (teste.length > max && atual) {
      linhas.push(atual);
      atual = palavra;
    } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 4);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { rank?: number; chamada?: string; cor?: string };
    const rank = Number(body.rank ?? 1);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      return Response.json({ erro: "Escolha uma posição entre 1 e 10." }, { status: 400 });
    }
    const chamada = typeof body.chamada === "string" ? body.chamada.trim().slice(0, 90) : "ANIMES MAIS ASSISTIDOS NO MUNDO";
    if (!chamada) return Response.json({ erro: "Informe o texto da thumbnail." }, { status: 400 });

    const dadosPath = path.join(raiz, "data", "top.json");
    if (!fs.existsSync(dadosPath)) return Response.json({ erro: "Gere um Top 10 primeiro para preparar os dados e as capas." }, { status: 422 });
    const dados = JSON.parse(fs.readFileSync(dadosPath, "utf8")) as TopData;
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    const item = itens.find((x) => x.rank === rank) ?? itens[rank - 1];
    if (!item) return Response.json({ erro: "A posição selecionada não existe no Top gerado." }, { status: 422 });
    const capaPath = arquivoCapa(item.capa);
    if (!capaPath) return Response.json({ erro: `Não encontrei a capa da posição ${rank} em public/gerado-top/.` }, { status: 422 });

    const largura = 1080, altura = 1920;
    const capa = await sharp(capaPath).rotate().resize(largura, altura, { fit: "cover", position: "attention" }).blur(24).modulate({ brightness: 0.42, saturation: 0.8 }).png().toBuffer();
    const destaque = await sharp(capaPath).rotate().resize(900, 1120, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const linhas = linhasTitulo(chamada.toLocaleUpperCase("pt-BR"), 18);
    const yInicio = 300 - Math.max(0, linhas.length - 2) * 34;
    const textos = linhas.map((linha, i) => {
      const fill = i % 2 === 0 ? "#ffe72e" : "#ffffff";
      return `<text x="540" y="${yInicio + i * 126}" text-anchor="middle" font-family="Arial Black,DejaVu Sans,sans-serif" font-size="104" font-weight="1000" fill="${fill}" stroke="#080808" stroke-width="25" stroke-linejoin="round" paint-order="stroke">${escaparSvg(linha)}</text>`;
    }).join("");
    const overlay = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060b" stop-opacity=".92"/><stop offset=".34" stop-color="#05060b" stop-opacity=".08"/><stop offset=".68" stop-color="#05060b" stop-opacity=".12"/><stop offset="1" stop-color="#05060b" stop-opacity=".96"/></linearGradient>
        <linearGradient id="rank" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff56a"/><stop offset="1" stop-color="#ff8a00"/></linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#shade)"/>
      <rect x="28" y="28" width="1024" height="1864" rx="38" fill="none" stroke="#fff" stroke-width="8"/>
      <text x="540" y="190" text-anchor="middle" font-family="Arial Black,DejaVu Sans,sans-serif" font-size="130" font-weight="1000" fill="url(#rank)" stroke="#080808" stroke-width="28" paint-order="stroke">TOP 10</text>
      ${textos}
      <text x="540" y="1590" text-anchor="middle" font-family="Arial Black,DejaVu Sans,sans-serif" font-size="92" font-weight="1000" fill="#fff" stroke="#080808" stroke-width="22" paint-order="stroke">${escaparSvg(item.titulo.toLocaleUpperCase("pt-BR").slice(0, 34))}</text>
      <rect x="300" y="1660" width="480" height="12" rx="6" fill="#ffe72e"/>
      <text x="540" y="1810" text-anchor="middle" font-family="Arial Black,DejaVu Sans,sans-serif" font-size="180" font-weight="1000" fill="url(#rank)" stroke="#080808" stroke-width="30" paint-order="stroke">#${rank}</text>
    </svg>`);

    const resultado = await sharp(capa).composite([
      { input: destaque, left: 90, top: 390 },
      { input: overlay, left: 0, top: 0 },
    ]).png().toBuffer();
    return new Response(resultado, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="thumbnail-top10-shorts.png"' },
    });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail Top 10:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail do Top 10. Confira se os dados e as capas foram preparados." }, { status: 500 });
  }
}
