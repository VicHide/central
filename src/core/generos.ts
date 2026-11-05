// Dados puros (sem Node) usados pelo painel, pela API e pelo comando `top`.
// O slug nunca tem espaço: é o que viaja na linha de comando.
export const GENEROS = [
  { id: "Action", slug: "acao", pt: "Ação" },
  { id: "Adventure", slug: "aventura", pt: "Aventura" },
  { id: "Comedy", slug: "comedia", pt: "Comédia" },
  { id: "Drama", slug: "drama", pt: "Drama" },
  { id: "Fantasy", slug: "fantasia", pt: "Fantasia" },
  { id: "Horror", slug: "terror", pt: "Terror" },
  { id: "Mahou Shoujo", slug: "garotas-magicas", pt: "Garotas mágicas" },
  { id: "Mecha", slug: "mecha", pt: "Mecha" },
  { id: "Music", slug: "musica", pt: "Música" },
  { id: "Mystery", slug: "misterio", pt: "Mistério" },
  { id: "Psychological", slug: "psicologico", pt: "Psicológico" },
  { id: "Romance", slug: "romance", pt: "Romance" },
  { id: "Sci-Fi", slug: "ficcao-cientifica", pt: "Ficção científica" },
  { id: "Slice of Life", slug: "slice-of-life", pt: "Slice of Life" },
  { id: "Sports", slug: "esportes", pt: "Esportes" },
  { id: "Supernatural", slug: "sobrenatural", pt: "Sobrenatural" },
  { id: "Thriller", slug: "suspense", pt: "Suspense" },
] as const;

export const TEMPORADAS = [
  { id: "WINTER", pt: "Inverno" },
  { id: "SPRING", pt: "Primavera" },
  { id: "SUMMER", pt: "Verão" },
  { id: "FALL", pt: "Outono" },
] as const;

export const ORDENS = [
  { id: "score", pt: "Melhor nota", curto: "melhor avaliados" },
  { id: "popularidade", pt: "Mais populares", curto: "mais populares" },
  { id: "tendencia", pt: "Em alta agora", curto: "em alta agora" },
] as const;

export const TAGS = [
  { id: "Isekai", slug: "isekai", pt: "Isekai" },
  { id: "Shounen", slug: "shounen", pt: "Shounen" },
  { id: "Seinen", slug: "seinen", pt: "Seinen" },
  { id: "Shoujo", slug: "shoujo", pt: "Shoujo" },
  { id: "Josei", slug: "josei", pt: "Josei" },
  { id: "School", slug: "escola", pt: "Vida escolar" },
  { id: "Magic", slug: "magia", pt: "Magia" },
  { id: "Military", slug: "militar", pt: "Militar" },
  { id: "Super Power", slug: "superpoderes", pt: "Superpoderes" },
  { id: "Time Manipulation", slug: "viagem-no-tempo", pt: "Manipulação do tempo" },
  { id: "Reincarnation", slug: "reencarnacao", pt: "Reencarnação" },
  { id: "Swordplay", slug: "espadas", pt: "Combate de espadas" },
  { id: "Samurai", slug: "samurai", pt: "Samurais" },
  { id: "Cyberpunk", slug: "cyberpunk", pt: "Cyberpunk" },
  { id: "Vampire", slug: "vampiros", pt: "Vampiros" },
  { id: "Post-Apocalyptic", slug: "pos-apocaliptico", pt: "Pós-apocalíptico" },
  { id: "Survival", slug: "sobrevivencia", pt: "Sobrevivência" },
] as const;

export const FORMATOS = [
  { slug: "tv", ids: ["TV", "TV_SHORT"], pt: "Séries de TV" },
  { slug: "filme", ids: ["MOVIE"], pt: "Filmes" },
  { slug: "ova-ona", ids: ["OVA", "ONA"], pt: "OVA e ONA" },
] as const;

export const SITUACOES = [
  { slug: "finalizado", id: "FINISHED", pt: "Finalizados" },
  { slug: "lancando", id: "RELEASING", pt: "Em exibição" },
] as const;

export const PAISES = [
  { slug: "jp", id: "JP", pt: "Japão" },
  { slug: "cn", id: "CN", pt: "China (donghua)" },
  { slug: "kr", id: "KR", pt: "Coreia do Sul" },
] as const;

// Intervalos de episódios (o AniList compara de forma exclusiva: "maior que" / "menor que").
export const DURACOES = [
  { slug: "curto", pt: "Curtos (até 13 ep.)", maior: undefined, menor: 14 },
  { slug: "medio", pt: "Médios (14 a 26 ep.)", maior: 13, menor: 27 },
  { slug: "longo", pt: "Longos (27+ ep.)", maior: 26, menor: undefined },
] as const;

export type FiltrosTexto = {
  genero?: string; tag?: string; temporada?: string; ano?: number; de?: number; ate?: number;
  formato?: string; situacao?: string; pais?: string; duracao?: string; ordem: string; n: number;
};

export function textoTop(o: FiltrosTexto) {
  const g = GENEROS.find((x) => x.slug === o.genero)?.pt;
  const tg = TAGS.find((x) => x.slug === o.tag)?.pt;
  const t = TEMPORADAS.find((x) => x.id === o.temporada)?.pt;
  const ord = ORDENS.find((x) => x.id === o.ordem)?.curto ?? "";
  const nucleo = [g, tg].filter(Boolean) as string[];
  const periodo = t ? `${t} ${o.ano ?? ""}`.trim()
    : o.de && o.ate ? (o.de === o.ate ? String(o.de) : `${o.de} a ${o.ate}`)
    : o.de ? `a partir de ${o.de}` : o.ate ? `até ${o.ate}` : o.ano ? String(o.ano) : "";
  const extras = [
    FORMATOS.find((x) => x.slug === o.formato)?.pt, SITUACOES.find((x) => x.slug === o.situacao)?.pt,
    PAISES.find((x) => x.slug === o.pais)?.pt, DURACOES.find((x) => x.slug === o.duracao)?.pt,
  ];
  return {
    titulo: `TOP ${o.n} ANIMES${nucleo.length ? ` DE ${nucleo.join(" + ").toUpperCase()}` : ""}`,
    subtitulo: [periodo, ...extras, ord].filter(Boolean).join(" · "),
  };
}
