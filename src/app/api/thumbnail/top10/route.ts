import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { comporTop10, textoAutomatico } from "@/server/thumbnail/top10";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TopItem = { rank: number; capa?: string | null };
type TopData = { titulo?: string; subtitulo?: string; itens?: TopItem[] };

const raiz = process.cwd();
const pastaPublica = path.resolve(raiz, "public");
const LIMITE_UPLOAD = 12 * 1024 * 1024;

function arquivoCapa(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const relativo = valor.replace(/^\/+/, "").replace(/^public\//, "");
  const absoluto = path.resolve(pastaPublica, relativo);
  if (!absoluto.startsWith(pastaPublica + path.sep) || !fs.existsSync(absoluto)) return null;
  return absoluto;
}

// Reconhece JPEG, PNG e WebP pelos primeiros bytes (não confia na extensão).
function ehImagem(b: Buffer) {
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return png || jpg || webp;
}

// Texto livre das faixas: letras, números, espaço e alguns sinais; sempre em maiúsculas.
function limpaTexto(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return undefined;
  if (typeof v !== "string") return null;
  const t = v.trim().toLocaleUpperCase("pt-BR");
return t.length <= max && /^[A-ZÀ-Ý0-9 +·.,!?\/&-]+$/.test(t) ? t : null;
}

export async function POST(request: Request) {
  try {
    let rank: string | undefined, destaque: unknown, linha2: unknown, linha3: unknown, arquivo: File | null = null;
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await request.formData();
      const txt = (k: string) => { const v = f.get(k); return typeof v === "string" ? v : undefined; };
      rank = txt("rank"); destaque = txt("destaque"); linha2 = txt("linha2"); linha3 = txt("linha3");
      const a = f.get("imagem");
      arquivo = a && typeof a !== "string" && a.size > 0 ? a : null;
    } else {
      const j = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      rank = j.rank === undefined ? undefined : String(j.rank);
      destaque = j.destaque; linha2 = j.linha2; linha3 = j.linha3;
    }

    const d1 = limpaTexto(destaque, 12), d2 = limpaTexto(linha2, 16), d3 = limpaTexto(linha3, 34);
    if (d1 === null || d2 === null || d3 === null) {
      return Response.json({ erro: "Os textos aceitam letras, números e espaços (palavra em destaque até 12, faixa amarela até 16, faixa branca até 34 caracteres)." }, { status: 400 });
    }

    const dadosPath = path.join(raiz, "data", "top.json");
    if (!fs.existsSync(dadosPath)) return Response.json({ erro: "Gere um Top 10 primeiro para preparar os dados e as capas." }, { status: 422 });
    const dados = JSON.parse(fs.readFileSync(dadosPath, "utf8")) as TopData;
    const itens = Array.isArray(dados.itens) ? dados.itens : [];
    if (itens.length === 0) return Response.json({ erro: "O último Top não tem itens." }, { status: 422 });

    // Imagem de fundo: a enviada pelo usuário, a capa escolhida ou uma capa sorteada.
    let fundo: string | Buffer | null = null;
    if (arquivo) {
      if (arquivo.size > LIMITE_UPLOAD) return Response.json({ erro: "A imagem passa de 12 MB. Envie um arquivo menor." }, { status: 400 });
      const buf = Buffer.from(await arquivo.arrayBuffer());
      if (!ehImagem(buf)) return Response.json({ erro: "O arquivo enviado não é uma imagem JPG, PNG ou WebP." }, { status: 400 });
      fundo = buf;
    } else if (rank && rank !== "auto") {
      const n = Number(rank);
      if (!Number.isInteger(n) || n < 1 || n > 10) return Response.json({ erro: "Escolha uma capa entre 1 e 10." }, { status: 400 });
      fundo = arquivoCapa((itens.find((x) => x.rank === n) ?? itens[n - 1])?.capa);
      if (!fundo) return Response.json({ erro: `Não encontrei a capa da posição ${n} em public/gerado-top/.` }, { status: 422 });
    } else {
      const capas = itens.map((x) => arquivoCapa(x.capa)).filter((c): c is string => Boolean(c));
      if (capas.length === 0) return Response.json({ erro: "Não encontrei capas em public/gerado-top/. Gere o Top com a opção de capas ou envie uma imagem." }, { status: 422 });
      fundo = capas[randomInt(capas.length)];
    }

    const auto = textoAutomatico(dados.titulo ?? "", dados.subtitulo ?? "");
    const png = await comporTop10({
      fundo, numero: itens.length,
      destaque: d1 ?? auto.destaque, linha2: d2 ?? auto.linha2, linha3: d3 ?? auto.linha3,
    });
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="thumbnail-top10-shorts.png"' },
    });
  } catch (erro) {
    console.error("Erro ao gerar thumbnail Top 10:", erro);
    return Response.json({ erro: "Não foi possível gerar a thumbnail do Top 10. Confira se os dados e as capas foram preparados." }, { status: 500 });
  }
}
