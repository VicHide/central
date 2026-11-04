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

export function textoTop(o: { genero?: string; temporada?: string; ano?: number; ordem: string; n: number }) {
  const g = GENEROS.find((x) => x.slug === o.genero)?.pt;
  const t = TEMPORADAS.find((x) => x.id === o.temporada)?.pt;
  const ord = ORDENS.find((x) => x.id === o.ordem)?.curto ?? "";
  const periodo = t ? `${t} ${o.ano ?? ""}`.trim() : o.ano ? String(o.ano) : "";
  return {
    titulo: `TOP ${o.n} ANIMES${g ? ` DE ${g.toUpperCase()}` : ""}`,
    subtitulo: [periodo, ord].filter(Boolean).join(" · "),
  };
}
