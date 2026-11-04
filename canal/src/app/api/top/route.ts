import { iniciaJob, temJobRodando } from "@/server/jobs";
import { GENEROS, TEMPORADAS, ORDENS } from "@/core/generos";
import { estimaDuracaoTop } from "@/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const genero = b.genero === undefined ? undefined : String(b.genero);
  const temporada = b.temporada === undefined ? undefined : String(b.temporada);
  const ano = b.ano === undefined ? undefined : Number(b.ano);
  const ordem = String(b.ordem ?? "score");
  const n = Number(b.n ?? 10);

  if (genero !== undefined && !GENEROS.some((g) => g.slug === genero)) return Response.json({ erro: "Gênero inválido." }, { status: 400 });
  if (temporada !== undefined && !TEMPORADAS.some((t) => t.id === temporada)) return Response.json({ erro: "Temporada inválida." }, { status: 400 });
  if (ano !== undefined && (!Number.isInteger(ano) || ano < 1980 || ano > 2100)) return Response.json({ erro: "Ano inválido." }, { status: 400 });
  if (temporada !== undefined && ano === undefined) return Response.json({ erro: "Informe o ano junto com a temporada." }, { status: 400 });
  if (!ORDENS.some((o) => o.id === ordem)) return Response.json({ erro: "Critério inválido." }, { status: 400 });
  if (!Number.isInteger(n) || n < 3 || n > 10) return Response.json({ erro: "Quantidade deve ser de 3 a 10." }, { status: 400 });
  if (temJobRodando()) return Response.json({ erro: "Já existe uma tarefa rodando. Espere terminar." }, { status: 409 });

  // Só enums e números validados vão para a linha de comando (o slug do gênero nunca tem espaço).
  const args = ["tsx", "src/core/top.ts", "--ordem", ordem, "--n", String(n)];
  if (genero) args.push("--genero", genero);
  if (temporada) args.push("--temporada", temporada);
  if (ano !== undefined) args.push("--ano", String(ano));
  if (b.render === true) args.push("--render");

  const pt = GENEROS.find((g) => g.slug === genero)?.pt ?? "todos os gêneros";
  const crit = ORDENS.find((o) => o.id === ordem)?.pt ?? ordem;
  const job = iniciaJob(`Top ${n} · ${pt} · ${crit}`, args, {
    n, render: b.render === true, duracaoSeg: estimaDuracaoTop(n), preparo: "Consulta ao AniList e capas",
    resumo: `${n} animes · ${temporada ? `${TEMPORADAS.find((t) => t.id === temporada)?.pt} ` : ""}${ano ?? "qualquer ano"}`,
  });
  return Response.json({ id: job.id });
}
