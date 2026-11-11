import { listaJobs, syncFanCapsJob } from "@/server/jobs";
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
