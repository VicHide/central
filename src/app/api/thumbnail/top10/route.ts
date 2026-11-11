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
  const entidades: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  };
  return texto.replace(/[&<>"']/g, (caractere) => entidades[caractere] ?? caractere);
}

function linhasTitulo(texto: string, max = 18) {
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
    const body = await request.json().catch(() => ({})) as { rank?: number; chamada?: string };
    const rank = Number(body.rank ?? 1);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      return Response.json({ erro: "Escolha uma capa entre 1 e 10." }, { status: 400 });
    }
    const chamada = typeof body.chamada === "string" ? body.chamada.trim().slice(0, 90) : "ANIMES MAIS ASSISTIDOS NO MUNDO";
    if (!chamada) return Response.json({ erro: "Informe o texto da thumbnail." }, { status: 400 });

    const dadosPath = path.join(raiz, "data", "top.json");
    if (!fs.existsSync(dadosPath)) return Response.json({ erro: "Gere um Top 10 primeiro para preparar os dados e as capas." }, { status: 422 });
    const dados = JSON.parse(fs.readFileSync(dadosPath, "utf8")) as TopData;
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    const item = itens.find((x) => x.rank === rank) ?? itens[rank - 1];
    if (!item) return Response.json({ erro: "A capa selecionada não existe no Top gerado." }, { status: 422 });
    const capaPath = arquivoCapa(item.capa);
    if (!capaPath) return Response.json({ erro: `Não encontrei a capa da posição ${rank} em public/gerado-top/.` }, { status: 422 });

    const largura = 1080, altura = 1920;
    const fundo = await sharp(capaPath)
      .rotate()
      .resize(largura, altura, { fit: "cover", position: "attention" })
      .modulate({ brightness: 0.78, saturation: 1.08 })
      .png()
      .toBuffer();

    const linhas = linhasTitulo(chamada.toLocaleUpperCase("pt-BR"), 17);
    const alturaTexto = linhas.length * 132;
    const yInicio = Math.round(920 - alturaTexto / 2 + 105);
    const textos = linhas.map((linha, i) => {
      const fill = i % 3 === 0 ? "#ffe52f" : i % 3 === 1 ? "#ffffff" : "#ff514f";
      const tamanho = linha.length > 15 ? 88 : 106;
      return `<text x="540" y="${yInicio + i * 132}" text-anchor="middle" font-family="Arial Black,DejaVu Sans,sans-serif" font-size="${tamanho}" font-weight="1000" fill="${fill}" stroke="#080808" stroke-width="25" stroke-linejoin="round" paint-order="stroke">${escaparSvg(linha)}</text>`;
    }).join("");

    const overlay = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#05060b" stop-opacity=".38"/>
          <stop offset=".25" stop-color="#05060b" stop-opacity="0"/>
          <stop offset=".48" stop-color="#05060b" stop-opacity=".18"/>
          <stop offset=".72" stop-color="#05060b" stop-opacity=".08"/>
          <stop offset="1" stop-color="#05060b" stop-opacity=".48"/>
        </linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <rect width="1080" height="1920" fill="url(#shade)"/>
      <rect x="70" y="${yInicio - 105}" width="940" height="${alturaTexto + 145}" rx="34" fill="#080808" opacity=".34" filter="url(#soft)"/>
      ${textos}
    </svg>`);

    const resultado = await sharp(fundo).composite([{ input: overlay }]).png().toBuffer();
    return new Response(resultado, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="thumbnail-top10-shorts.png"' },
    });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail Top 10:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail do Top 10. Confira se os dados e as capas foram preparados." }, { status: 500 });
  }
}
