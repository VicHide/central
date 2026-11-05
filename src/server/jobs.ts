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


type FanCapsQueueSnapshot = {
  active: boolean;
  paused: boolean;
  state: string;
  items: { anime_title: string; episode_title: string; processed: number; image_count: number; downloaded: number; skipped: number; errors: number; status: string; current_image_id: number | null }[];
  totals: { episodes: number; images: number; downloaded: number; skipped: number; errors: number; processed: number };
  last_error?: string | null;
  last_summary?: { result: string } | null;
  project_root?: string;
  download_dir?: string;
};

const runtime = g as typeof g & { __fanCapsJobId?: string; __fanCapsLastProgress?: string; __fanCapsWasActive?: boolean };

export function syncFanCapsJob(queue: FanCapsQueueSnapshot) {
  let job = runtime.__fanCapsJobId ? jobs.find((item) => item.id === runtime.__fanCapsJobId) : undefined;

  // Se a fila foi limpa, encerra o registro que ainda estiver aberto no painel.
  if (queue.items.length === 0) {
    if (job?.status === "rodando") {
      job.status = "ok";
      job.fim = Date.now();
      job.etapa = "Fila limpa";
      job.detalhe = "A fila foi removida.";
      job.log.push("Fila removida pelo usuário.");
      runtime.__fanCapsJobId = undefined;
      runtime.__fanCapsLastProgress = "";
      runtime.__fanCapsWasActive = false;
    }
    return;
  }
  if (queue.active && (!job || job.status !== "rodando" || !runtime.__fanCapsWasActive)) {
    job = {
      id: `fancaps-${Date.now().toString(36)}`,
      titulo: "FanCaps Downloader",
      status: "rodando",
      inicio: Date.now(),
      log: [
        "Fila de downloads iniciada.",
        ...(queue.project_root ? [`Projeto Python: ${queue.project_root}`] : []),
        ...(queue.download_dir ? [`Destino das imagens: ${queue.download_dir}`] : []),
      ],
    };
    jobs.push(job);
    runtime.__fanCapsJobId = job.id;
    runtime.__fanCapsLastProgress = "";
  }
  runtime.__fanCapsWasActive = queue.active;

  if (!job) return;
  const pct = queue.totals.images > 0
    ? Math.min(100, Math.round((queue.totals.processed / queue.totals.images) * 100))
    : 0;
  job.pct = pct;
  job.etapa = queue.paused ? "Downloads pausados" : queue.active ? "Baixando imagens" : "Fila de downloads";
  job.detalhe = `${queue.totals.processed}/${queue.totals.images} imagens processadas`;
  const current = queue.items.find((item) => item.status === "running");
  if (current) {
    job.detalhe = `${current.anime_title} · ${current.episode_title}${current.current_image_id ? ` · imagem ${current.current_image_id}` : ""}`;
  }

  const progressKey = [
    queue.state, queue.totals.processed, queue.totals.downloaded,
    queue.totals.skipped, queue.totals.errors, queue.last_error ?? "",
  ].join("|");
  if (progressKey !== runtime.__fanCapsLastProgress) {
    runtime.__fanCapsLastProgress = progressKey;
    if (queue.totals.processed > 0) {
      job.log.push(
        `Progresso: ${queue.totals.processed}/${queue.totals.images} · ${queue.totals.downloaded} baixadas · ${queue.totals.skipped} já existentes · ${queue.totals.errors} erros.`
      );
    }
    if (queue.last_error) job.log.push(`Erro: ${queue.last_error}`);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  }

  if (!queue.active && job.status === "rodando") {
    const result = queue.last_summary?.result;
    job.status = result === "completed" ? "ok" : "erro";
    job.fim = Date.now();
    job.etapa = result === "blocked" ? "Bloqueado pelo servidor" : result === "completed" ? "Concluído" : "Encerrado com erro";
    job.detalhe = `${queue.totals.downloaded} baixadas · ${queue.totals.skipped} existentes · ${queue.totals.errors} erros`;
    job.log.push(`Fila encerrada: ${job.detalhe}.`);
    runtime.__fanCapsJobId = undefined;
    runtime.__fanCapsWasActive = false;
  }
}
