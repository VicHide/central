// Uso: npm run top -- [--genero acao] [--tag isekai] [--temporada FALL --ano 2026] [--de 2015 --ate 2020]
//   [--formato tv|filme|ova-ona] [--situacao finalizado|lancando] [--pais jp|cn|kr] [--duracao curto|medio|longo]
//   [--nota-min 75] [--ordem score|popularidade|tendencia] [--n 10] [--sem-musica] [--render]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { topAnilist, Ordem } from "./anilist";
import { renderVideo } from "./render";
import { escolheMusica } from "./musica";
import { GENEROS, TEMPORADAS, ORDENS, TAGS, FORMATOS, SITUACOES, PAISES, DURACOES, textoTop } from "./generos";

const RAIZ = process.cwd();
const PASTA_CAPAS = path.join(RAIZ, "public", "gerado-top");
const arg = (k: string, d = "") => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const render = process.argv.includes("--render");
const peso = render ? 10 : 100;
const evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) => console.log("@@" + JSON.stringify(o));
const falha = (msg: string): never => { console.error(msg); process.exit(1); };
const acha = <T extends { slug: string }>(lista: readonly T[], nome: string, rotulo: string): T | undefined => {
  const slug = arg(nome);
  return slug ? lista.find((x) => x.slug === slug) ?? falha(`${rotulo}: valor desconhecido (${slug})`) : undefined;
};
const inteiro = (nome: string, min: number, max: number) => {
  if (!arg(nome)) return undefined;
  const v = Number(arg(nome));
  return Number.isInteger(v) && v >= min && v <= max ? v : falha(`Valor inválido em --${nome}.`);
};

async function main() {
  const genero = acha(GENEROS, "genero", "Gênero");
  const tag = acha(TAGS, "tag", "Tag");
  const formato = acha(FORMATOS, "formato", "Formato");
  const situacao = acha(SITUACOES, "situacao", "Situação");
  const pais = acha(PAISES, "pais", "País");
  const duracao = acha(DURACOES, "duracao", "Duração");
  const temporada = arg("temporada");
  if (temporada && !TEMPORADAS.some((t) => t.id === temporada)) falha(`Temporada inválida: ${temporada}`);
  const ano = inteiro("ano", 1960, 2100), de = inteiro("de", 1960, 2100), ate = inteiro("ate", 1960, 2100), notaMin = inteiro("nota-min", 0, 100);
  if (temporada && ano === undefined) falha("Informe o ano junto com a temporada.");
  if (de !== undefined && ate !== undefined && de > ate) falha("O ano inicial não pode ser maior que o final.");
  const ordem = arg("ordem", "score") as Ordem;
  if (!ORDENS.some((o) => o.id === ordem)) falha(`Ordem inválida: ${ordem}`);
  const n = Math.min(10, Math.max(3, Number(arg("n", "10"))));

  evento({ etapa: "Consultando o AniList", pct: 1 });
  const midias = await topAnilist({
    genero: genero?.id, tag: tag?.id, temporada: temporada || undefined, ano, deAno: de, ateAno: ate,
    formatos: formato?.ids, status: situacao?.id, pais: pais?.id, notaMin, epMaior: duracao?.maior, epMenor: duracao?.menor, ordem, n,
  });
  if (midias.length === 0) falha("Nenhum anime encontrado com esses filtros. Tente afrouxar algum deles.");

  fs.rmSync(PASTA_CAPAS, { recursive: true, force: true });
  fs.mkdirSync(PASTA_CAPAS, { recursive: true });
  const itens = [];
  for (const [i, m] of midias.entries()) {
    evento({ etapa: "Baixando capas", pct: Math.round(peso * (0.1 + (0.9 * i) / midias.length)), detalhe: `capa ${i + 1}/${midias.length}` });
    let capa: string | null = null;
    if (m.capa) {
      try {
        const r = await fetch(m.capa);
        if (!r.ok) throw new Error(String(r.status));
        await sharp(Buffer.from(await r.arrayBuffer())).resize(800, 1200, { fit: "cover" }).jpeg({ quality: 88 }).toFile(path.join(PASTA_CAPAS, `top-${i + 1}.jpg`));
        capa = `gerado-top/top-${i + 1}.jpg`;
      } catch (e) { console.warn(`Aviso: capa de "${m.titulo}" não baixou (${(e as Error).message}); usando placeholder.`); }
    }
    itens.push({ rank: i + 1, titulo: m.titulo, nota: m.nota, generos: m.generos.slice(0, 3), estudio: m.estudio, episodios: m.episodios, capa, ano: m.ano, formato: m.formato, popularidade: m.popularidade });
  }

  const { titulo, subtitulo } = textoTop({ genero: genero?.slug, tag: tag?.slug, temporada: temporada || undefined, ano, de, ate, formato: formato?.slug, situacao: situacao?.slug, pais: pais?.slug, duracao: duracao?.slug, ordem, n: midias.length });
  fs.writeFileSync(path.join(RAIZ, "data", "top.json"), JSON.stringify({ titulo, subtitulo, itens, fonte: "Dados e capas: AniList" }, null, 2));
  const musica = escolheMusica(Math.random, !process.argv.includes("--sem-musica"));

  const nome = `top-${[genero?.slug ?? "geral", tag?.slug, ordem, temporada.toLowerCase(), ano, de, ate].filter(Boolean).join("-")}`;
  fs.mkdirSync(path.join(RAIZ, "out"), { recursive: true });
  const lista = itens.map((i) => `${i.rank}. ${i.titulo}${i.nota ? ` (${(i.nota / 10).toFixed(1)})` : ""}`).join("\n");
  fs.writeFileSync(path.join(RAIZ, "out", `${nome}.txt`),
    `${titulo[0]}${titulo.slice(1).toLowerCase()}${subtitulo ? ` | ${subtitulo}` : ""} #shorts\n\n${lista}\n\nQual é o seu número 1? Comente!\n\nDados e capas: AniList (anilist.co)${musica.credito ? `\n\nMúsica:\n${musica.credito}` : ""}\n\n#anime #top10 #shorts\n`);
  evento({ etapa: "Dados prontos", pct: peso });

  if (render) await renderVideo("TopShort", path.join(RAIZ, "out", `${nome}.mp4`), evento);
  evento({ etapa: "Concluído", pct: 100 });
  console.log(`OK: ${itens.length} animes. Texto: out/${nome}.txt`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
