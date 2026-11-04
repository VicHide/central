import { iniciaJob, temJobRodando } from "@/server/jobs";
import { estimaDuracao } from "@/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const modo = b.modo;
  const n = Number(b.n), cortes = Number(b.cortes ?? 1);
  const seed = b.seed === undefined ? undefined : Number(b.seed);
  if (modo !== "zoom" && modo !== "quatro") return Response.json({ erro: "Modo inválido." }, { status: 400 });
  if (!Number.isInteger(n) || n < 1 || n > 100) return Response.json({ erro: "Número de animes deve ser de 1 a 100." }, { status: 400 });
  if (!Number.isInteger(cortes) || cortes < 1 || cortes > 6) return Response.json({ erro: "Cortes deve ser de 1 a 6." }, { status: 400 });
  if (seed !== undefined && !Number.isInteger(seed)) return Response.json({ erro: "Seed inválida." }, { status: 400 });
  if (temJobRodando()) return Response.json({ erro: "Já existe uma tarefa rodando. Espere terminar." }, { status: 409 });

  const args = ["tsx", "src/core/gerar.ts", "--modo", modo, "--n", String(n), "--cortes", String(cortes)];
  if (seed !== undefined) args.push("--seed", String(seed));
  if (b.render === true) args.push("--render");
  const job = iniciaJob(`Quiz de ${n} animes · ${modo === "zoom" ? "zoom e revelação" : "4 imagens"}`, args, {
    n, render: b.render === true, duracaoSeg: estimaDuracao(modo, n, cortes), preparo: "Sorteio, imagens e cortes",
    resumo: `${n} animes${modo === "zoom" ? ` · ${cortes} corte(s)` : ""}${seed !== undefined ? ` · seed ${seed}` : ""}`,
  });
  return Response.json({ id: job.id });
}
