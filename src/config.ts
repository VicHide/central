// Tempos do modo zoom (em segundos). Usados pelo vídeo e pelos capítulos do texto.
export const SEG_POR_CORTE = 4; // tempo em cada etapa: zoom e depois a imagem inteira
export const SEG_REVELACAO = 3; // tempo do letreiro com o nome do anime
export const INTRO_SEG = 8; // duração da abertura com as explicações em vários idiomas

// Duração estimada do vídeo longo (abertura + perguntas), em segundos.
export const estimaDuracao = (modo: "zoom" | "quatro", n: number, cortes: number) =>
  INTRO_SEG + n * (modo === "zoom" ? (cortes + 1) * SEG_POR_CORTE + SEG_REVELACAO : 4 * 3 + 3);

// Short "Top N" do AniList (em segundos).
export const TOP_INTRO_SEG = 3;
export const TOP_ITEM_SEG = 5; // 10 itens ≈ 56 s no total
export const TOP_FIM_SEG = 3;
export const estimaDuracaoTop = (n: number) => TOP_INTRO_SEG + n * TOP_ITEM_SEG + TOP_FIM_SEG;

// Tic-tac do quiz: quantos segundos antes da revelação cada batida toca (acelera no fim).
export const TICS_ANTES_DO_FIM = [2, 1.5, 1, 0.75, 0.5, 0.25];
