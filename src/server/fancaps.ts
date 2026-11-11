import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

type Runtime = { child?: ChildProcess; starting?: Promise<void> };
type Health = { ok?: boolean; catalog_ready?: boolean; error?: string | null; project_root?: string; download_dir?: string };
const runtime = globalThis as typeof globalThis & { __fancapsRuntime?: Runtime };
const state = runtime.__fancapsRuntime ?? (runtime.__fancapsRuntime = {});
const apiBase = "http://127.0.0.1:8765";
const pythonRoot = path.resolve(process.cwd(), "FanCaps-Downloader");
const expectedDownloadDir = path.resolve(process.cwd(), "acervo");

function normalizePath(value: string) {
  const resolved = path.resolve(value).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function readHealth(): Promise<Health | null> {
  try {
    const response = await fetch(apiBase + "/health", { cache: "no-store", signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    return await response.json() as Health;
  } catch {
    return null;
  }
}

function validateHealth(health: Health, requireCatalog = true) {
  if (!health.project_root || !health.download_dir) {
    throw new Error("A API FanCaps que está na porta 8765 é de uma versão antiga ou de outro diretório. Encerre essa instância e reinicie o Next.js para iniciar a API correta.");
  }
  if (normalizePath(health.project_root) !== normalizePath(pythonRoot)) {
    throw new Error(`A API FanCaps está sendo executada em outro projeto: ${health.project_root}. O projeto atual espera ${pythonRoot}. Encerre a instância antiga na porta 8765 e tente novamente.`);
  }
  if (normalizePath(health.download_dir) !== normalizePath(expectedDownloadDir)) {
    throw new Error(`O FanCaps está gravando em ${health.download_dir}, mas o acervo do Next está em ${expectedDownloadDir}.`);
  }
  if (requireCatalog && !health.catalog_ready) {
    throw new Error(health.error || "A API iniciou, mas não conseguiu carregar o catálogo do FanCaps.");
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureFanCapsApi(requireCatalog = true) {
  const existing = await readHealth();
  if (existing) {
    validateHealth(existing, requireCatalog);
    return;
  }

  if (!state.starting) {
    state.starting = (async () => {
      const configured = process.env.FANCAPS_PYTHON;
      const localPython = path.join(pythonRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
      const useLocal = fs.existsSync(localPython);
      const command = configured || (useLocal ? localPython : process.platform === "win32" ? "py" : "python3");
      const args = configured || useLocal
        ? ["-m", "fancaps_downloader.api_server"]
        : process.platform === "win32"
          ? ["-3", "-m", "fancaps_downloader.api_server"]
          : ["-m", "fancaps_downloader.api_server"];
      const child = spawn(command, args, {
        cwd: pythonRoot,
        env: { ...process.env, PYTHONPATH: pythonRoot },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      state.child = child;
      child.stdout?.on("data", (chunk) => process.stdout.write("[FanCaps] " + chunk));
      child.stderr?.on("data", (chunk) => process.stderr.write("[FanCaps] " + chunk));
      child.on("exit", () => { if (state.child === child) state.child = undefined; });
      for (let attempt = 0; attempt < 30; attempt++) {
        const health = await readHealth();
        if (health) {
          validateHealth(health, requireCatalog);
          return;
        }
        if (child.exitCode !== null) break;
        await wait(250);
      }
      throw new Error("Não foi possível iniciar a API Python do FanCaps. Confira o Python, as dependências e data/anime_data.json.");
    })().finally(() => { state.starting = undefined; });
  }
  await state.starting;
}

export async function callFanCapsApi(pathname: string, method: "GET" | "POST", body?: unknown) {
  await ensureFanCapsApi(!pathname.startsWith("/frames"));
  const response = await fetch(apiBase + pathname, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({ erro: "Resposta inválida da API Python." }));
  return Response.json(data, { status: response.status });
}

export async function readFanCapsQueueIfRunning() {
  const health = await readHealth();
  if (!health) return null;
  validateHealth(health);
  const response = await fetch(apiBase + "/queue", {
    cache: "no-store",
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) return null;
  return await response.json();
}
