import { spawn, ChildProcess } from "node:child_process";

export type JobMeta = { n: number; render: boolean; duracaoSeg: number; resumo: string; preparo: string };
export type Job = { id: string; titulo: string; status: "rodando" | "ok" | "erro"; inicio: number; fim?: number; log: string[]; etapa?: string; pct?: number; eta?: number; detalhe?: string; meta?: JobMeta };

// Fica em globalThis para sobreviver ao hot reload do Next em desenvolvimento.
const g = globalThis as unknown as { __jobs?: Job[]; __studio?: ChildProcess };
const jobs: Job[] = (g.__jobs ??= []);

export const listaJobs = () => jobs.slice(-20).reverse();
export const temJobRodando = () => jobs.some((j) => j.status === "rodando");

// Só recebe argumentos já validados (enum e números); nunca texto livre do usuário.
export function iniciaJob(titulo: string, args: string[], meta?: JobMeta): Job {
  const job: Job = { id: Date.now().toString(36), titulo, status: "rodando", inicio: Date.now(), log: [], meta };
  jobs.push(job);
  const p = spawn("npx", args, { cwd: process.cwd(), shell: process.platform === "win32" });
  const trata = (l: string) => {
    if (!l.trim()) return;
    if (l.startsWith("@@")) {
      try {
        const o = JSON.parse(l.slice(2));
        job.etapa = String(o.etapa); job.pct = Number(o.pct); job.eta = o.eta === undefined ? undefined : Number(o.eta);
        job.detalhe = o.detalhe === undefined ? undefined : String(o.detalhe);
      } catch { /* linha incompleta */ }
      return;
    }
    job.log.push(l);
    if (job.log.length > 200) job.log.shift();
  };
  // Cada fluxo guarda a última linha incompleta até chegar o resto.
  const ouvinte = () => {
    let resto = "";
    return (b: Buffer) => {
      const partes = (resto + b.toString()).split(/\r?\n|\r/);
      resto = partes.pop() ?? "";
      partes.forEach(trata);
    };
  };
  p.stdout.on("data", ouvinte());
  p.stderr.on("data", ouvinte());
  p.on("error", (e) => { job.log.push(String(e)); job.status = "erro"; job.fim = Date.now(); });
  p.on("close", (c) => { job.status = c === 0 ? "ok" : "erro"; job.fim = Date.now(); });
  return job;
}

export function iniciaStudio() {
  if (g.__studio && g.__studio.exitCode === null) return;
  g.__studio = spawn("npx", ["remotion", "studio", "src/video/index.ts", "--port", "3001", "--no-open"], {
    cwd: process.cwd(), stdio: "ignore", shell: process.platform === "win32",
  });
}
