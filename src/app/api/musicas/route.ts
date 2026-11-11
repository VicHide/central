import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Faixa = { arquivo: string; titulo: string; artista: string; credito: string; volume: number; ativa: boolean };
const raiz = process.cwd();
const catalogo = path.join(raiz, "data", "musicas.json");
const pasta = path.join(raiz, "public", "musica");
const extensoes = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const leCatalogo = (): Faixa[] => {
  if (!fs.existsSync(catalogo)) return [];
  const dados = JSON.parse(fs.readFileSync(catalogo, "utf8"));
  return Array.isArray(dados.faixas) ? dados.faixas : [];
};
const salva = (faixas: Faixa[]) => {
  fs.mkdirSync(path.dirname(catalogo), { recursive: true });
  fs.writeFileSync(catalogo, JSON.stringify({ faixas }, null, 2) + "\n", "utf8");
};
const nomeSeguro = (nome: string) => nome.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

export async function GET() {
  try { return Response.json({ faixas: leCatalogo() }); }
  catch { return Response.json({ erro: "Não foi possível ler data/musicas.json." }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return Response.json({ erro: "Selecione um arquivo de áudio." }, { status: 400 });
    if (arquivo.size > 80 * 1024 * 1024) return Response.json({ erro: "O arquivo excede o limite de 80 MB." }, { status: 413 });
    const ext = path.extname(arquivo.name).toLowerCase();
    if (!extensoes.has(ext)) return Response.json({ erro: "Formato não permitido. Use MP3, WAV, OGG, M4A, AAC ou FLAC." }, { status: 400 });
    const faixas = leCatalogo();
    const base = nomeSeguro(path.basename(arquivo.name, ext)) || "faixa";
    fs.mkdirSync(pasta, { recursive: true });
    let nome = base + ext, n = 2;
    while (fs.existsSync(path.join(pasta, nome))) nome = base + "-" + n++ + ext;
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    fs.writeFileSync(path.join(pasta, nome), bytes, { flag: "wx" });
    const titulo = String(form.get("titulo") || path.basename(arquivo.name, ext)).trim().slice(0, 160);
    const artista = String(form.get("artista") || "").trim().slice(0, 160);
    const credito = String(form.get("credito") || "").trim().slice(0, 1000);
    const volumeBruto = Number(form.get("volume") ?? 0.18);
    const faixa: Faixa = { arquivo: "musica/" + nome, titulo, artista, credito, volume: Number.isFinite(volumeBruto) ? Math.max(0, Math.min(1, volumeBruto)) : 0.18, ativa: true };
    try { salva([...faixas, faixa]); }
    catch (e) { fs.rmSync(path.join(pasta, nome), { force: true }); throw e; }
    return Response.json({ faixa, quantidade: faixas.length + 1 }, { status: 201 });
  } catch (e) {
    return Response.json({ erro: e instanceof Error ? e.message : "Falha ao cadastrar a música." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { arquivo?: string; ativa?: boolean; titulo?: string; artista?: string; credito?: string; volume?: number };
    const faixas = leCatalogo();
    const i = faixas.findIndex((f) => f.arquivo === body.arquivo);
    if (i < 0) return Response.json({ erro: "Música não encontrada." }, { status: 404 });
    faixas[i] = { ...faixas[i], ...(typeof body.ativa === "boolean" ? { ativa: body.ativa } : {}), ...(typeof body.titulo === "string" ? { titulo: body.titulo.trim().slice(0,160) } : {}), ...(typeof body.artista === "string" ? { artista: body.artista.trim().slice(0,160) } : {}), ...(typeof body.credito === "string" ? { credito: body.credito.trim().slice(0,1000) } : {}), ...(typeof body.volume === "number" && Number.isFinite(body.volume) ? { volume: Math.max(0, Math.min(1, body.volume)) } : {}) };
    salva(faixas);
    return Response.json({ faixas });
  } catch { return Response.json({ erro: "Não foi possível atualizar o catálogo." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { arquivo?: string };
    const arquivo = String(body.arquivo ?? "");
    const faixas = leCatalogo();
    const faixa = faixas.find((f) => f.arquivo === arquivo);
    if (!faixa) return Response.json({ erro: "Música não encontrada." }, { status: 404 });
    const nome = path.basename(arquivo);
    if (path.dirname(arquivo) !== "musica" || !extensoes.has(path.extname(nome).toLowerCase())) return Response.json({ erro: "Caminho de arquivo inválido." }, { status: 400 });
    salva(faixas.filter((f) => f.arquivo !== arquivo));
    fs.rmSync(path.join(pasta, nome), { force: true });
    return Response.json({ ok: true, faixas: faixas.length - 1 });
  } catch { return Response.json({ erro: "Não foi possível excluir a música." }, { status: 500 }); }
}
