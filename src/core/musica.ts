import fs from "node:fs";
import path from "node:path";

type Faixa = { arquivo?: string; titulo?: string; artista?: string; credito?: string; volume?: number; ativa?: boolean };
const VOLUME_PADRAO = 0.18;

// Sorteia uma faixa de data/musicas.json (só as que existem em public/) e grava data/musica-atual.json.
// Devolve o texto de crédito para a descrição do vídeo.
export function escolheMusica(rand: () => number, usar: boolean): { credito: string | null } {
  const raiz = process.cwd();
  const saida = path.join(raiz, "data", "musica-atual.json");
  const nenhuma = () => { fs.writeFileSync(saida, JSON.stringify({ arquivo: null, volume: VOLUME_PADRAO })); return { credito: null }; };
  const catalogo = path.join(raiz, "data", "musicas.json");
  if (!usar || !fs.existsSync(catalogo)) return nenhuma();
  const faixas = ((JSON.parse(fs.readFileSync(catalogo, "utf8")).faixas ?? []) as Faixa[])
    .filter((f) => f.ativa !== false && f.arquivo && fs.existsSync(path.join(raiz, "public", f.arquivo)));
  if (faixas.length === 0) { console.warn("Aviso: nenhuma faixa de música disponível (veja data/musicas.json). O vídeo sai sem música."); return nenhuma(); }
  const f = faixas[Math.floor(rand() * faixas.length)];
  fs.writeFileSync(saida, JSON.stringify({ arquivo: f.arquivo, volume: f.volume ?? VOLUME_PADRAO }));
  if (!f.credito?.trim()) console.warn(`Aviso: a faixa "${f.titulo ?? f.arquivo}" está sem o crédito oficial em data/musicas.json. Preencha antes de publicar.`);
  return { credito: f.credito?.trim() || `Música: ${f.titulo ?? f.arquivo}${f.artista ? ` - ${f.artista}` : ""} (cole aqui o crédito oficial da faixa)` };
}
