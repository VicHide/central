import { iniciaJob, temJobRodando } from "@/server/jobs";
import { GENEROS, TEMPORADAS, ORDENS, TAGS, FORMATOS, SITUACOES, PAISES, DURACOES } from "@/core/generos";
import { estimaDuracaoTop } from "@/config";

export const dynamic = "force-dynamic";
const erro = (msg: string) => Response.json({ erro: msg }, { status: 400 });
const slugEm = (lista: readonly { slug: string }[], v: unknown) => v === undefined || lista.some((x) => x.slug === v);
const inteiro = (v: unknown, min: number, max: number) => v === undefined || (Number.isInteger(v) && (v as number) >= min && (v as number) <= max);

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const orNull = (v: unknown) => (v === "" || v === null ? undefined : v);
  const genero = orNull(b.genero), tag = orNull(b.tag), formato = orNull(b.formato), situacao = orNull(b.situacao);
  const pais = orNull(b.pais), duracao = orNull(b.duracao), temporada = orNull(b.temporada);
  const ano = orNull(b.ano), de = orNull(b.de), ate = orNull(b.ate), notaMin = orNull(b.notaMin);
  const ordem = String(b.ordem ?? "score");
  const n = Number(b.n ?? 10);

  if (!slugEm(GENEROS, genero)) return erro("Gênero inválido.");
  if (!slugEm(TAGS, tag)) return erro("Tag inválida.");
  if (!slugEm(FORMATOS, formato)) return erro("Formato inválido.");
  if (!slugEm(SITUACOES, situacao)) return erro("Situação inválida.");
  if (!slugEm(PAISES, pais)) return erro("País inválido.");
  if (!slugEm(DURACOES, duracao)) return erro("Duração inválida.");
  if (temporada !== undefined && !TEMPORADAS.some((t) => t.id === temporada)) return erro("Temporada inválida.");
  if (!inteiro(ano, 1960, 2100) || !inteiro(de, 1960, 2100) || !inteiro(ate, 1960, 2100)) return erro("Ano inválido.");
  if (!inteiro(notaMin, 0, 100)) return erro("Nota mínima deve ser de 0 a 100.");
  if (typeof de === "number" && typeof ate === "number" && de > ate) return erro("O ano inicial não pode ser maior que o final.");
  if (temporada !== undefined && ano === undefined) return erro("Informe o ano junto com a temporada.");
  if (!ORDENS.some((o) => o.id === ordem)) return erro("Critério inválido.");
  if (!Number.isInteger(n) || n < 3 || n > 10) return erro("Quantidade deve ser de 3 a 10.");
  if (temJobRodando()) return Response.json({ erro: "Já existe uma tarefa rodando. Espere terminar." }, { status: 409 });

  // Só enums (slugs sem espaço) e números validados vão para a linha de comando.
  const args = ["tsx", "src/core/top.ts", "--ordem", ordem, "--n", String(n)];
  const flags: [string, unknown][] = [["--genero", genero], ["--tag", tag], ["--formato", formato], ["--situacao", situacao], ["--pais", pais], ["--duracao", duracao], ["--temporada", temporada], ["--ano", ano], ["--de", de], ["--ate", ate], ["--nota-min", notaMin]];
  for (const [flag, v] of flags) if (v !== undefined) args.push(flag, String(v));
  if (b.musica === false) args.push("--sem-musica");
  if (b.render === true) args.push("--render");

  const nucleo = [GENEROS.find((g) => g.slug === genero)?.pt, TAGS.find((x) => x.slug === tag)?.pt].filter(Boolean).join(" + ") || "todos os gêneros";
  const crit = ORDENS.find((o) => o.id === ordem)?.pt ?? ordem;
  const filtros = [
    temporada ? `${TEMPORADAS.find((t) => t.id === temporada)?.pt} ${ano}` : ano ? String(ano) : null,
    de || ate ? `${de ?? "…"}–${ate ?? "…"}` : null,
    FORMATOS.find((x) => x.slug === formato)?.pt, SITUACOES.find((x) => x.slug === situacao)?.pt,
    PAISES.find((x) => x.slug === pais)?.pt, DURACOES.find((x) => x.slug === duracao)?.pt,
    notaMin ? `nota ≥ ${notaMin}` : null,
  ].filter(Boolean);
  const job = iniciaJob(`Top ${n} · ${nucleo} · ${crit}`, args, {
    n, render: b.render === true, duracaoSeg: estimaDuracaoTop(n), preparo: "Consulta ao AniList e capas",
    resumo: `${n} animes · ${filtros.length ? filtros.join(" · ") : "sem filtros extras"}`,
  });
  return Response.json({ id: job.id });
}
