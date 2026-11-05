import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

type Runtime = { child?: ChildProcess; starting?: Promise<void> };
const runtime = globalThis as typeof globalThis & { __fancapsRuntime?: Runtime };
const state = runtime.__fancapsRuntime ?? (runtime.__fancapsRuntime = {});

const apiBase = "http://127.0.0.1:8765";
const projectRoot = process.cwd();
const pythonRoot = path.join(projectRoot, "FanCaps-Downloader");

async function healthy() {
  try {
    const response = await fetch(`${apiBase}/health`, { cache: "no-store", signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureFanCapsApi() {
  if (await healthy()) return;
  if (!state.starting) {
    state.starting = (async () => {
      if (!(await healthy())) {
        const configured = process.env.FANCAPS_PYTHON;
        const command = configured || (process.platform === "win32" ? "py" : "python3");
        const args = configured
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
        child.stdout?.on("data", (chunk) => process.stdout.write(`[FanCaps] ${chunk}`));
        child.stderr?.on("data", (chunk) => process.stderr.write(`[FanCaps] ${chunk}`));
        child.on("exit", () => {
          if (state.child === child) state.child = undefined;
        });

        for (let attempt = 0; attempt < 30; attempt++) {
          if (await healthy()) return;
          if (child.exitCode !== null) break;
          await wait(250);
        }
        throw new Error("Não foi possível iniciar a API Python do FanCaps. Confira se o Python está instalado e se data/anime_data.json existe.");
      }
    })().finally(() => {
      state.starting = undefined;
    });
  }
  await state.starting;
}

export async function callFanCapsApi(pathname: string, method: "GET" | "POST", body?: unknown) {
  await ensureFanCapsApi();
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({ erro: "Resposta inválida da API Python." }));
  return Response.json(data, { status: response.status });
}
