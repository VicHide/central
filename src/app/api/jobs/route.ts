import { listaJobs } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const GET = async () => Response.json(listaJobs().map((j) => ({ ...j, log: j.log.slice(-40) })));
