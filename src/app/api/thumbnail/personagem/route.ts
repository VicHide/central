import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { randomInt } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const raiz = process.cwd();
const publicDir = path.resolve(raiz, "public");
const extensoes = new Set(["image/png", "image/jpeg", "image/webp"]);

function removerFundo(entrada: Buffer): Promise<Buffer> {
  const script = path.join(raiz, "thumbnail-ai", "remover_fundo.py");
  const comando = process.env.THUMBNAIL_PYTHON || (process.platform === "win32" ? "python" : "python3");

  return new Promise((resolve, reject) => {
    const processo = spawn(comando, [script], { cwd: raiz, windowsHide: true });
    const saida: Buffer[] = [];
    const erros: Buffer[] = [];
    let finalizado = false;

    processo.stdout.on("data", (parte: Buffer) => saida.push(parte));
    processo.stderr.on("data", (parte: Buffer) => erros.push(parte));
    processo.on("error", (erro) => {
      if (finalizado) return;
      finalizado = true;
      reject(new Error(`Não consegui iniciar o Python (${comando}). Configure THUMBNAIL_PYTHON ou instale as dependências em thumbnail-ai/requirements.txt. ${erro.message}`));
    });
    processo.on("close", (codigo) => {
      if (finalizado) return;
      finalizado = true;
      if (codigo !== 0) {
        reject(new Error(Buffer.concat(erros).toString("utf8").slice(-1800) || "A remoção de fundo falhou."));
        return;
      }
      const resultado = Buffer.concat(saida);
      if (!resultado.length) {
        reject(new Error("O removedor de fundo não retornou uma imagem."));
        return;
      }
      resolve(resultado);
    });

    processo.stdin.on("error", () => undefined);
    processo.stdin.end(entrada);
  });
}

function embaralha<T>(itens: T[]): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function caminhoImagem(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const relativo = valor.replace(/^\/+/, "").replace(/^public\//, "");
  if (!/\.(jpe?g|png|webp)$/i.test(relativo)) return null;
  const absoluto = path.resolve(publicDir, relativo);
  return absoluto.startsWith(publicDir + path.sep) && fs.existsSync(absoluto) ? absoluto : null;
}

async function cartao(arquivo: string, numero: number, cor: string, xNumero: number) {
  const largura = 590, altura = 290;
  const imagem = await sharp(arquivo).rotate().resize(largura, altura, { fit: "cover" }).png().toBuffer();
  const mascara = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="28" fill="white"/></svg>`);
  const recorte = await sharp(imagem).composite([{ input: mascara, blend: "dest-in" }]).png().toBuffer();
  const arte = Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="584" height="284" rx="32" fill="none" stroke="#101820" stroke-width="18"/>
    <rect x="9" y="9" width="572" height="272" rx="27" fill="none" stroke="${cor}" stroke-width="9"/>
    <rect x="17" y="17" width="556" height="256" rx="22" fill="none" stroke="#fff" stroke-width="4"/>
    <circle cx="${xNumero}" cy="48" r="38" fill="#ed174c" stroke="#fff" stroke-width="8"/>
    <circle cx="${xNumero}" cy="48" r="33" fill="none" stroke="#111" stroke-width="4"/>
    <text x="${xNumero}" y="63" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="42" font-weight="900" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke">${numero}</text>
  </svg>`);
  return sharp(recorte).composite([{ input: arte }]).png().toBuffer();
}

async function personagemComContorno(arquivo: Buffer) {
  const imagem = await sharp(arquivo).rotate().resize(570, 570, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
  const svg = Buffer.from(`<svg width="610" height="610" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="outline" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="15" result="outer"/>
      <feFlood flood-color="#101820" result="dark"/><feComposite in="dark" in2="outer" operator="in" result="darkStroke"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="8" result="inner"/>
      <feFlood flood-color="#fff" result="light"/><feComposite in="light" in2="inner" operator="in" result="lightStroke"/>
      <feMerge><feMergeNode in="darkStroke"/><feMergeNode in="lightStroke"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>
    <image x="20" y="20" width="570" height="570" href="data:image/png;base64,${imagem.toString("base64")}" filter="url(#outline)"/>
  </svg>`);
  return sharp(svg).png().toBuffer();
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const arquivo = form.get("imagem");
    if (!(arquivo instanceof File)) {
      return Response.json({ erro: "Selecione uma imagem do personagem." }, { status: 400 });
    }
    if (!extensoes.has(arquivo.type)) {
      return Response.json({ erro: "Use uma imagem PNG, JPG ou WebP." }, { status: 415 });
    }
    if (arquivo.size <= 0 || arquivo.size > 12 * 1024 * 1024) {
      return Response.json({ erro: "A imagem precisa ter até 12 MB." }, { status: 413 });
    }

    const entrada = Buffer.from(await arquivo.arrayBuffer());
    const metadata = await sharp(entrada, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 80) {
      return Response.json({ erro: "A imagem precisa ter pelo menos 80 × 80 pixels." }, { status: 422 });
    }

    const semFundo = await removerFundo(entrada);
    const transparente = await sharp(semFundo).ensureAlpha().png().toBuffer();

    const introPath = path.join(raiz, "data", "intro.json");
    const intro = fs.existsSync(introPath) ? JSON.parse(fs.readFileSync(introPath, "utf8")) as { modo?: string } : {};
    const modo = intro.modo === "zoom" ? "zoom" : "quatro";
    const dadosPath = path.join(raiz, "data", modo === "zoom" ? "zoom.json" : "perguntas.json");
    if (!fs.existsSync(dadosPath)) {
      return Response.json({ erro: "Não encontrei os dados do último quiz." }, { status: 422 });
    }
    const dados = JSON.parse(fs.readFileSync(dadosPath, "utf8")) as { capa?: string; imagem?: string; imagens?: string[] }[];
    if (!Array.isArray(dados) || dados.length < 4) {
      return Response.json({ erro: "O último quiz precisa ter pelo menos 4 animes." }, { status: 422 });
    }
    const imagens = dados.map((item) => caminhoImagem(modo === "zoom" ? item.imagem : item.capa) ?? caminhoImagem(item.imagens?.[0]))
      .filter((item): item is string => Boolean(item));
    if (imagens.length < 4) {
      return Response.json({ erro: "Não encontrei 4 imagens válidas para os quadros." }, { status: 422 });
    }

    const escolhidas = embaralha(imagens).slice(0, 4);
    const posicoes = [
      { x: 8, y: 12, n: 1, cor: "#f21d50", cx: 42 },
      { x: 682, y: 12, n: 2, cor: "#a52bff", cx: 548 },
      { x: 8, y: 368, n: 3, cor: "#ffb21c", cx: 42 },
      { x: 682, y: 368, n: 4, cor: "#20c8ed", cx: 548 },
    ];
    const fundo = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101522"/><stop offset=".5" stop-color="#21152e"/><stop offset="1" stop-color="#071a25"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#572b83" stop-opacity=".8"/><stop offset="1" stop-color="#101522" stop-opacity="0"/></radialGradient></defs>
      <rect width="1280" height="720" fill="url(#bg)"/><ellipse cx="640" cy="350" rx="620" ry="430" fill="url(#glow)"/>
      <rect x="8" y="8" width="1264" height="704" rx="34" fill="none" stroke="#05070d" stroke-width="16"/>
      <rect x="14" y="14" width="1252" height="692" rx="29" fill="none" stroke="#f2f2f2" stroke-width="5"/>
    </svg>`);
    const camadas: OverlayOptions[] = [{ input: fundo, left: 0, top: 0 }];
    for (let i = 0; i < 4; i++) {
      const p = posicoes[i];
      camadas.push({ input: await cartao(escolhidas[i], p.n, p.cor, p.cx), left: p.x, top: p.y });
    }
    camadas.push({ input: await personagemComContorno(transparente), left: 335, top: 55 });

    const decoracao = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <g font-family="DejaVu Sans,sans-serif" font-weight="900" text-anchor="middle" paint-order="stroke">
        <text x="640" y="96" font-size="116" fill="#ff174f" stroke="#101820" stroke-width="18">?</text>
        <text x="790" y="170" font-size="78" fill="#ffe23b" stroke="#101820" stroke-width="14">!</text>
      </g>
      <text x="640" y="625" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="112" font-weight="900" fill="#fff56a" stroke="#080808" stroke-width="25" stroke-linejoin="round" paint-order="stroke">${dados.length}</text>
      <text x="640" y="704" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="76" font-weight="900" fill="#fff" stroke="#080808" stroke-width="22" stroke-linejoin="round" paint-order="stroke">ANIMES</text>
    </svg>`);
    const resultado = await sharp({ create: { width: 1280, height: 720, channels: 4, background: "#101522" } })
      .composite([...camadas, { input: decoracao }]).png().toBuffer();
    return new Response(resultado, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="thumbnail-personagem.png"' } });
  } catch (erro) {
    console.error("Erro na thumbnail com personagem:", erro);
    const detalhe = erro instanceof Error ? erro.message : "Erro desconhecido.";
    return Response.json({ erro: detalhe.includes("isnet-anime") || detalhe.includes("rembg")
      ? "Não foi possível remover o fundo. Confira a instalação de thumbnail-ai/requirements.txt e tente novamente."
      : detalhe }, { status: 500 });
  }
}
