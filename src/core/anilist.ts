// Consulta rankings no AniList (GraphQL). Guarda só o resultado de cada consulta, por pouco tempo,
// e só pede o que o vídeo usa: sem coletar o catálogo (os termos do AniList proíbem acumular dados em massa).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const URL_API = process.env.ANILIST_URL ?? "https://graphql.anilist.co";
const TTL_MS = 12 * 3600 * 1000;

export type Ordem = "score" | "popularidade" | "tendencia";
export type Midia = {
  id: number; titulo: string; nota: number | null; generos: string[]; estudio: string | null; episodios: number | null;
  capa: string | null; ano: number | null; formato: string | null; popularidade: number | null;
};
export type Filtros = {
  genero?: string; tag?: string; temporada?: string; ano?: number; deAno?: number; ateAno?: number;
  formatos?: readonly string[]; status?: string; pais?: string; notaMin?: number; epMaior?: number; epMenor?: number;
  ordem: Ordem; n: number; minPop?: number;
};

const SORT: Record<Ordem, string> = { score: "SCORE_DESC", popularidade: "POPULARITY_DESC", tendencia: "TRENDING_DESC" };

type Bruto = {
  id: number; title: { romaji: string | null; english: string | null }; coverImage: { extraLarge: string | null; large: string | null } | null;
  averageScore: number | null; genres: string[] | null; episodes: number | null; studios: { nodes: { name: string }[] } | null;
  startDate: { year: number | null } | null; format: string | null; popularity: number | null;
};

// Monta a consulta só com os filtros usados (evita mandar valores nulos).
function monta(o: Filtros) {
  const decl = ["$sort: [MediaSort]", "$perPage: Int"];
  const args = ["type: ANIME", "sort: $sort", "isAdult: false"];
  const variables: Record<string, unknown> = { sort: [SORT[o.ordem]], perPage: o.n };
  const filtro = (nome: string, tipo: string, valor: unknown) => {
    if (valor === undefined || valor === null || valor === "" || (Array.isArray(valor) && valor.length === 0)) return;
    decl.push(`$${nome}: ${tipo}`); args.push(`${nome}: $${nome}`); variables[nome] = valor;
  };
  filtro("genre", "String", o.genero);
  filtro("tag_in", "[String]", o.tag ? [o.tag] : undefined);
  filtro("season", "MediaSeason", o.temporada);
  filtro("seasonYear", "Int", o.ano);
  // Datas fuzzy: AAAA0000 vem antes de qualquer data de AAAA.
  filtro("startDate_greater", "FuzzyDateInt", o.deAno !== undefined ? o.deAno * 10000 : undefined);
  filtro("startDate_lesser", "FuzzyDateInt", o.ateAno !== undefined ? (o.ateAno + 1) * 10000 : undefined);
  filtro("format_in", "[MediaFormat]", o.formatos?.length ? [...o.formatos] : ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA"]);
  filtro("status_in", "[MediaStatus]", o.status ? [o.status] : undefined);
  filtro("countryOfOrigin", "CountryCode", o.pais);
  filtro("averageScore_greater", "Int", o.notaMin);
  filtro("episodes_greater", "Int", o.epMaior);
  filtro("episodes_lesser", "Int", o.epMenor);
  // Na ordenação por nota, exige um mínimo de popularidade para não subir título quase desconhecido.
  filtro("popularity_greater", "Int", o.minPop ?? (o.ordem === "score" ? 10000 : 0));
  const query = `query (${decl.join(", ")}) { Page(page: 1, perPage: $perPage) { media(${args.join(", ")}) {
    id title { romaji english } coverImage { extraLarge large } averageScore popularity format genres episodes
    startDate { year } studios(isMain: true) { nodes { name } } } } }`;
  return { query, variables };
}

export async function topAnilist(o: Filtros): Promise<Midia[]> {
  const { query, variables } = monta(o);
  const dir = path.join(process.cwd(), "data", "cache");
  const arq = path.join(dir, `anilist-${crypto.createHash("sha1").update(JSON.stringify(variables)).digest("hex").slice(0, 12)}.json`);
  if (fs.existsSync(arq)) {
    const c = JSON.parse(fs.readFileSync(arq, "utf8"));
    if (Date.now() - c.t < TTL_MS) return c.dados;
  }

  let bruto: Bruto[] | undefined;
  for (let tentativa = 0; tentativa < 3 && !bruto; tentativa++) {
    const r = await fetch(URL_API, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (r.status === 429) {
      const espera = Number(r.headers.get("retry-after") ?? 30);
      console.log(`O AniList pediu para esperar ${espera}s (limite de requisições).`);
      await new Promise((res) => setTimeout(res, espera * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`O AniList respondeu ${r.status}.`);
    const j = await r.json();
    if (j.errors) throw new Error(j.errors.map((e: { message: string }) => e.message).join("; "));
    bruto = j.data.Page.media as Bruto[];
  }
  if (!bruto) throw new Error("O AniList recusou por excesso de requisições. Tente de novo em alguns minutos.");

  const dados: Midia[] = bruto.map((m) => ({
    id: m.id, titulo: m.title.english ?? m.title.romaji ?? "Sem título", nota: m.averageScore, generos: m.genres ?? [],
    estudio: m.studios?.nodes[0]?.name ?? null, episodios: m.episodes, capa: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    ano: m.startDate?.year ?? null, formato: m.format, popularidade: m.popularity,
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(arq, JSON.stringify({ t: Date.now(), dados }));
  return dados;
}
