// Uso: npm run gerar -- --modo zoom|quatro --n 10 [--cortes 1] [--seed 123] [--render]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { renderVideo } from "./render";
import { escolheMusica } from "./musica";
import { buscaAnime, Ficha } from "./anilist";
import { GENEROS } from "./generos";
import { SEG_POR_CORTE, SEG_REVELACAO, INTRO_SEG } from "../config";

const RAIZ = process.cwd();
const ACERVO = path.join(RAIZ, "acervo");
const GERADO = path.join(RAIZ, "public", "gerado");
const HIST = path.join(RAIZ, "data", "historico.json");
const EXT = /\.(jpe?g|png|webp)$/i;

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const modo = arg("modo", "zoom") as "zoom" | "quatro";
const n = Number(arg("n", "10"));
const nCortes = Math.max(1, Number(arg("cortes", "1"))); // 1 = um zoom só e depois a imagem inteira
const seed = Number(arg("seed", String(Date.now() % 1e9)));
const render = process.argv.includes("--render");
const usarAnilist = !process.argv.includes("--sem-anilist"); // revelação do modo "quatro": capa e nota do AniList
const peso = render ? 10 : 100; // % da barra usada na preparação dos dados e imagens
// Linhas "@@{...}" são lidas pelo painel para mostrar etapa, porcentagem e tempo restante.
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) => console.log("@@" + JSON.stringify(o));

// Sorteio reproduzível: a mesma seed gera o mesmo vídeo.
function rng(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
function embaralha<T>(l: T[]): T[] {
  return l.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

type Hist = Record<string, string[]>; // pasta -> arquivos já usados em vídeos
const hist: Hist = fs.existsSync(HIST) ? JSON.parse(fs.readFileSync(HIST, "utf8")) : {};

const nomeBonito = (pasta: string) => {
  const f = path.join(ACERVO, pasta, "anime.json");
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")).nome as string; } catch { /* usa o nome da pasta */ }
  }
  return pasta.replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
};
// "capa.jpg|png|webp" é o cartão de capa da revelação: não entra no sorteio das dicas.
const imagens = (pasta: string) => fs.readdirSync(path.join(ACERVO, pasta)).filter((f) => EXT.test(f) && !/^capa\./i.test(f)).sort();
const capaDe = (pasta: string) => fs.readdirSync(path.join(ACERVO, pasta)).find((f) => EXT.test(f) && /^capa\./i.test(f));
// anime.json opcional: { "nome": "Dr. Stone", "anilistId": 105333, "nota": 8.7 }
// anilistId força o anime certo no AniList; nota (0 a 10) substitui a do AniList.
const extras = (pasta: string): { anilistId?: number; nota?: number } => {
  const f = path.join(ACERVO, pasta, "anime.json");
  if (!fs.existsSync(f)) return {};
  try { const j = JSON.parse(fs.readFileSync(f, "utf8")); return { anilistId: Number.isInteger(j.anilistId) ? j.anilistId : undefined, nota: typeof j.nota === "number" ? j.nota : undefined }; } catch { return {}; }
};

// Pontos com mais detalhe (bordas), para o zoom não cair em céu ou fundo liso.
async function pontosDeDetalhe(arquivo: string, k: number) {
  const { data, info } = await sharp(arquivo).resize(64, 36, { fit: "cover" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, bw = 8, bh = 6;
  const cel: { bx: number; by: number; v: number }[] = [];
  for (let by = 0; by < H / bh; by++)
    for (let bx = 0; bx < W / bw; bx++) {
      let v = 0;
      for (let y = by * bh; y < (by + 1) * bh - 1; y++)
        for (let x = bx * bw; x < (bx + 1) * bw - 1; x++) {
          const d = data[y * W + x];
          v += Math.abs(data[y * W + x + 1] - d) + Math.abs(data[(y + 1) * W + x] - d);
        }
      cel.push({ bx, by, v });
    }
  const escolhidas: typeof cel = [];
  for (const c of cel.sort((a, b) => b.v - a.v)) {
    if (escolhidas.every((e) => Math.max(Math.abs(e.bx - c.bx), Math.abs(e.by - c.by)) >= 2)) escolhidas.push(c);
    if (escolhidas.length === k) break;
  }
  return escolhidas.map((c) => ({ x: Math.round(((c.bx + 0.5) * bw / W) * 100), y: Math.round(((c.by + 0.5) * bh / H) * 100) }));
}

async function baixaCapa(url: string, destino: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  await sharp(Buffer.from(await r.arrayBuffer())).resize(680, 1020, { fit: "cover" }).jpeg({ quality: 88 }).toFile(destino);
}

async function prepara(pasta: string, arquivo: string, saida: string) {
  await sharp(path.join(ACERVO, pasta, arquivo)).resize(1920, 1080, { fit: "cover" }).jpeg({ quality: 88 }).toFile(path.join(GERADO, saida));
  return `gerado/${saida}`;
}

// Prefere imagens ainda não usadas daquela pasta.
function escolheImagens(pasta: string, k: number) {
  const usadas = new Set(hist[pasta] ?? []);
  const lista = embaralha(imagens(pasta)).sort((a, b) => Number(usadas.has(a)) - Number(usadas.has(b)));
  if (lista.length < k) console.warn(`Aviso: "${pasta}" tem só ${lista.length} imagem(ns); repetindo.`);
  return Array.from({ length: k }, (_, i) => lista[i % lista.length]);
}

async function main() {
  const pastas = fs.existsSync(ACERVO) ? fs.readdirSync(ACERVO, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).filter((p) => imagens(p).length > 0) : [];
  if (pastas.length < n) { console.error(`Pedi ${n} animes, mas o acervo tem ${pastas.length} pasta(s) com imagens.`); process.exit(1); }

  fs.rmSync(GERADO, { recursive: true, force: true });
  fs.mkdirSync(GERADO, { recursive: true });

  // Os menos usados primeiro, com sorteio entre empates.
  const uso = (p: string) => hist[p]?.length ?? 0;
  const escolhidos = embaralha(embaralha(pastas).sort((a, b) => uso(a) - uso(b)).slice(0, n));

  const saida: unknown[] = [];
  const duracoes: number[] = [];
  for (const [i, pasta] of escolhidos.entries()) {
    const numero = i + 1, anime = nomeBonito(pasta);
    evento({ etapa: "Preparando imagens", pct: Math.round((peso * i) / escolhidos.length), detalhe: `anime ${numero}/${escolhidos.length}` });
    if (modo === "zoom") {
      const [arq] = escolheImagens(pasta, 1);
      const imagem = await prepara(pasta, arq, `${numero}.jpg`);
      const cortes = (await pontosDeDetalhe(path.join(ACERVO, pasta, arq), nCortes)).map((p, j) => ({ ...p, zoom: nCortes === 1 ? 3.5 : 4 - (2 * j) / (nCortes - 1) }));
      saida.push({ numero, anime, imagem, cortes });
      duracoes.push((cortes.length + 1) * SEG_POR_CORTE + SEG_REVELACAO);
      hist[pasta] = [...(hist[pasta] ?? []), arq];
    } else {
      const arqs = escolheImagens(pasta, 4);
      const imgs = await Promise.all(arqs.map((a, j) => prepara(pasta, a, `${numero}_${j + 1}.jpg`)));
      const ex = extras(pasta);
      let ficha: Ficha | null = null;
      if (usarAnilist) {
        try {
          ficha = await buscaAnime(anime, ex.anilistId);
          if (ficha) console.log(`AniList: "${anime}" -> "${ficha.titulo}" (id ${ficha.id}). Se estiver errado, ponha "anilistId" no anime.json da pasta.`);
          else console.warn(`Aviso: "${anime}" não foi encontrado no AniList.`);
        } catch (e) { console.warn(`Aviso: AniList falhou para "${anime}" (${(e as Error).message}); a revelação sai sem esses dados.`); }
      }
      // Capa: o arquivo capa.* da pasta tem prioridade; senão, a do AniList.
      const arqCapa = capaDe(pasta);
      let capa: string | null = null;
      if (arqCapa) {
        await sharp(path.join(ACERVO, pasta, arqCapa)).resize(680, 1020, { fit: "cover" }).jpeg({ quality: 88 }).toFile(path.join(GERADO, `${numero}_capa.jpg`));
        capa = `gerado/${numero}_capa.jpg`;
      } else if (ficha?.capa) {
        try { await baixaCapa(ficha.capa, path.join(GERADO, `${numero}_capa.jpg`)); capa = `gerado/${numero}_capa.jpg`; }
        catch (e) { console.warn(`Aviso: capa do AniList de "${anime}" não baixou (${(e as Error).message}).`); }
      }
      saida.push({
        numero, anime, imagens: imgs, capa,
        nota: ex.nota ?? (ficha?.nota != null ? ficha.nota / 10 : null),
        generos: (ficha?.generos ?? []).slice(0, 2).map((g) => GENEROS.find((x) => x.id === g)?.pt ?? g),
        ano: ficha?.ano ?? null, formato: ficha?.formato ?? null, estudio: ficha?.estudio ?? null,
      });
      duracoes.push(4 * 3 + 3); // modo quatro usa os tempos de QuizLongo (3 s por dica)
      hist[pasta] = [...(hist[pasta] ?? []), ...arqs];
    }
  }

  evento({ etapa: "Dados prontos", pct: peso });
  const arquivoDados = path.join(RAIZ, "data", modo === "zoom" ? "zoom.json" : "perguntas.json");
  fs.writeFileSync(arquivoDados, JSON.stringify(saida, null, 2));
  fs.writeFileSync(HIST, JSON.stringify(hist, null, 2));

  // Abertura: promos/ -> faixa de imagens que passa ao lado das explicações.
  const PROMOS = path.join(RAIZ, "promos");
  const promos: (string | null)[] = [];
  if (fs.existsSync(PROMOS)) {
    for (const [j, f] of embaralha(fs.readdirSync(PROMOS).filter((x) => EXT.test(x))).slice(0, 6).entries()) {
      await sharp(path.join(PROMOS, f)).resize(1000, 1080, { fit: "cover" }).jpeg({ quality: 88 }).toFile(path.join(GERADO, `promo-${j + 1}.jpg`));
      promos.push(`gerado/promo-${j + 1}.jpg`);
    }
  }
  fs.writeFileSync(path.join(RAIZ, "data", "intro.json"), JSON.stringify({ modo, promos: promos.length ? promos : [null, null, null] }, null, 2));

  const musica = escolheMusica(rand, !process.argv.includes("--sem-musica"));

  // Texto de publicação (capítulos sem spoiler).
  let t = INTRO_SEG; // a abertura vem antes da pergunta 1
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const caps = ["00:00 Abertura", ...duracoes.map((d, i) => { const l = `${mmss(t)} Pergunta ${i + 1}`; t += d; return l; })];
  const titulo = `Adivinhe ${n} animes ${modo === "zoom" ? "pelo zoom" : "com 4 dicas"}`;
  fs.mkdirSync(path.join(RAIZ, "out"), { recursive: true });
  fs.writeFileSync(path.join(RAIZ, "out", `${modo}-${seed}.txt`), `${titulo}\n\n${caps.join("\n")}\n${musica.credito ? `\nMúsica:\n${musica.credito}\n` : ""}`);

  console.log(`OK: ${n} animes, modo ${modo}, seed ${seed}.\nDados: ${path.relative(RAIZ, arquivoDados)} | Texto: out/${modo}-${seed}.txt`);

  if (render) await renderVideo(modo === "zoom" ? "ZoomCompleto" : "QuizCompleto", path.join(RAIZ, "out", `${modo}-${seed}.mp4`), evento);
  evento({ etapa: "Concluído", pct: 100 });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
