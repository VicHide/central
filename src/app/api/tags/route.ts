import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

type Registro = {
  anime?: string;
  titulo?: string;
  generos?: string[];
  estudio?: string | null;
  ano?: number | null;
  formato?: string | null;
};

const leJson = (arquivo: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", arquivo), "utf8"));
  } catch {
    return null;
  }
};

const normaliza = (valor: unknown) =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";

function tagsUnicas(valores: string[]) {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of valores) {
    const tag = normaliza(bruto).replace(/[,#]/g, "").trim();
    const chave = tag.toLocaleLowerCase("pt-BR");
    if (!tag || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(tag);
  }
  return saida;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tipo = body.tipo === "quiz" ? "quiz" : body.tipo === "top" ? "top" : null;
  if (!tipo) return Response.json({ erro: "Tipo de vídeo inválido." }, { status: 400 });

  const arquivo = tipo === "top" ? "top.json" : "perguntas.json";
  const dados = leJson(arquivo);
  if (!Array.isArray(dados) && tipo === "quiz") {
    return Response.json({ erro: "Ainda não há dados de quiz. Gere um vídeo primeiro." }, { status: 404 });
  }

  const registros: Registro[] = tipo === "top"
    ? ((dados as { itens?: Registro[] } | null)?.itens ?? [])
    : (dados as Registro[] | null) ?? [];
  if (registros.length === 0) {
    return Response.json({ erro: tipo === "top" ? "Ainda não há um Top gerado. Gere um Top primeiro." : "Não encontrei animes no último quiz." }, { status: 404 });
  }

  const nomes = registros.map((r) => normaliza(r.titulo ?? r.anime)).filter(Boolean);
  const generos = registros.flatMap((r) => r.generos ?? []);
  const estudios = registros.map((r) => normaliza(r.estudio ?? ""));
  const anos = registros.map((r) => r.ano).filter((v): v is number => Number.isInteger(v));
  const formatos = registros.map((r) => normaliza(r.formato ?? ""));

  const base = tipo === "top"
    ? ["anime", "top 10 anime", "melhores animes", "ranking de animes", "animes recomendados", "lista de animes", "anime 2026", "shorts", "youtube shorts"]
    : ["anime", "quiz de anime", "adivinhe o anime", "desafio anime", "teste seus conhecimentos", "quiz otaku", "animes", "anime quiz"];
  const termosGenero = generos.map((g) => g);
  const termosNomes = nomes;
  const termosEstudio = estudios.filter(Boolean);
  const termosAno = [...new Set(anos)].map(String);
  const termosFormato = formatos.filter(Boolean);

  // O YouTube limita o campo de tags a 500 caracteres; preserva termos inteiros.
  const candidatos = tagsUnicas([...base, ...termosNomes, ...termosGenero, ...termosEstudio, ...termosFormato, ...termosAno]);
  const selecionadas: string[] = [];
  let total = 0;
  for (const tag of candidatos) {
    const custo = tag.length + (selecionadas.length ? 2 : 0);
    if (total + custo > 500) continue;
    selecionadas.push(tag);
    total += custo;
  }
  const texto = selecionadas.join(", ");
  return Response.json({ tags: texto, quantidade: selecionadas.length, caracteres: texto.length, fonte: arquivo });
}
