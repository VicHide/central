import { listaJobs, removeJobConcluido, removeJobsConcluidos, syncFanCapsJob } from "@/server/jobs";
import { readFanCapsQueueIfRunning } from "@/server/fancaps";

export const dynamic = "force-dynamic";

export const GET = async () => {
  try {
    const queue = await readFanCapsQueueIfRunning();
    if (queue && queue.totals && Array.isArray(queue.items)) syncFanCapsJob(queue);
  } catch {
    // O painel de projetos continua disponível mesmo se a API FanCaps estiver indisponível.
  }
  return Response.json(listaJobs().map((j) => ({ ...j, log: j.log.slice(-40) })));
};

export const DELETE = async (req: Request) => {
  try {
    const body = await req.json();
    if (typeof body?.id === "string" && body.id.length > 0) {
      const removido = removeJobConcluido(body.id);
      return removido
        ? Response.json({ removidos: 1 })
        : Response.json({ erro: "Tarefa não encontrada ou não está concluída." }, { status: 404 });
    }
    if (body?.limparConcluidos === true) {
      return Response.json({ removidos: removeJobsConcluidos() });
    }
    return Response.json({ erro: "Informe uma tarefa ou solicite a limpeza dos concluídos." }, { status: 400 });
  } catch {
    return Response.json({ erro: "Não foi possível processar a solicitação." }, { status: 400 });
  }
};
