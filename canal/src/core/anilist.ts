// Consulta rankings no AniList (GraphQL). Guarda só o resultado de cada consulta, por pouco tempo,
// e só pede o que o vídeo usa: sem coletar o catálogo (os termos do AniList proíbem acumular dados em massa).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const URL_API = process.env.ANILIST_URL ?? "https://graphql.anilist.co";
const TTL_MS = 12 * 3600 * 1000;

export type Ordem = "score" | "popularidade" | "tendencia";
export type Midia = {
  id: number; titulo: string; nota: number | null; generos: string[];
  estudio: string | null; episodios: number | null; capa: string | null;
};

const SORT: Record<Ordem, string> = { score: "SCORE_DESC", popularidade: "POPULARITY_DESC", tendencia: "TRENDING_DESC" };

const QUERY = `query ($genre: String, $season: MediaSeason, $year: Int, $sort: [MediaSort], $perPage: Int, $minPop: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: ANIME, genre: $genre, season: $season, seasonYear: $year, sort: $sort, isAdult: false,
          popularity_greater: $minPop, format_in: [TV, TV_SHORT, MOVIE, OVA, ONA]) {
      id title { romaji english } coverImage { extraLarge large }
      averageScore genres episodes studios(isMain: true) { nodes { name } }
    }
  }
}`;

type Bruto = {
  id: number; title: { romaji: string | null; english: string | null }; coverImage: { extraLarge: string | null; large: string | null } | null;
  averageScore: number | null; genres: string[] | null; episodes: number | null; studios: { nodes: { name: string }[] } | null;
};

export async function topAnilist(o: { genero?: string; temporada?: string; ano?: number; ordem: Ordem; n: number; minPop?: number }): Promise<Midia[]> {
  const variables = {
    genre: o.genero || null, season: o.temporada || null, year: o.ano ?? null,
    sort: [SORT[o.ordem]], perPage: o.n,
    // Na ordenação por nota, exige um mínimo de popularidade para não subir título quase desconhecido.
    minPop: o.minPop ?? (o.ordem === "score" ? 10000 : 0),
  };
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
      body: JSON.stringify({ query: QUERY, variables }),
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
    id: m.id, titulo: m.title.english ?? m.title.romaji ?? "Sem título",
    nota: m.averageScore, generos: m.genres ?? [], estudio: m.studios?.nodes[0]?.name ?? null,
    episodios: m.episodes, capa: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(arq, JSON.stringify({ t: Date.now(), dados }));
  return dados;
}
