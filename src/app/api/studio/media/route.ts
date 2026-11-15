import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "media_hunter.py");

function pythonCandidates() {
  if (process.platform === "win32") {
    return [{ bin: "py", prefix: ["-3"] }, { bin: "python", prefix: [] }];
  }
  return [{ bin: "python3", prefix: [] }, { bin: "python", prefix: [] }];
}

async function runPython(args: string[], timeoutMs = 90_000) {
  let lastErr: unknown;
  for (const cand of pythonCandidates()) {
    try {
      console.log(`[studio/media] executando: ${cand.bin} ${[...cand.prefix, "media_hunter.py", ...args].join(" ")}`);
      const { stdout, stderr } = await execFileAsync(cand.bin, [...cand.prefix, SCRIPT_PATH, ...args], {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (stderr?.trim()) console.warn(`[studio/media] stderr (${cand.bin}):`, stderr.trim().slice(0, 300));
      return { data: JSON.parse(stdout.trim()), runner: `${cand.bin} ${cand.prefix.join(" ")}`.trim() };
    } catch (err) {
      console.warn(`[studio/media] falhou em ${cand.bin}:`, err instanceof Error ? err.message : String(err));
      lastErr = err;
      continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Python não disponível para executar media_hunter.py.");
}

async function fallbackBingSearch(query: string, limit: number) {
  const url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=0&count=${Math.max(limit * 2, 10)}&qft=+filterui:imagesize-large`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const raw = await res.text().catch(() => "");
  const items: Array<{
    source: string;
    kind: "image";
    title: string;
    url: string;
    thumbnail: string;
    width: number;
    height: number;
  }> = [];
  const seen = new Set<string>();
  const regex = /m="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    try {
      const decoded = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      const meta = JSON.parse(decoded) as { murl?: string; turl?: string; t?: string };
      const imgUrl = meta.murl || "";
      if (!imgUrl || !imgUrl.startsWith("http") || seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      items.push({
        source: "bing",
        kind: "image",
        title: meta.t || query,
        url: imgUrl,
        thumbnail: meta.turl || imgUrl,
        width: 0,
        height: 0,
      });
      if (items.length >= limit) break;
    } catch {
      continue;
    }
  }
  return items;
}

async function fallbackWallhavenSearch(query: string, limit: number) {
  const run = async (q: string) => {
    const url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&purity=100&sorting=relevance&page=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!res || !res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id?: string; path?: string; thumbs?: { large?: string; original?: string }; dimension_x?: number; dimension_y?: number }>;
    };
    return (data.data ?? [])
      .slice(0, limit)
      .map((row) => ({
        source: "wallhaven",
        kind: "image" as const,
        title: `Wallhaven ${row.id ?? ""}`.trim(),
        url: row.path ?? "",
        thumbnail: row.thumbs?.large ?? row.thumbs?.original ?? row.path ?? "",
        width: row.dimension_x ?? 0,
        height: row.dimension_y ?? 0,
      }))
      .filter((i) => i.url);
  };

  let items = await run(query);
  if (items.length === 0 && query.trim().split(/\s+/).length > 3) {
    items = await run(query.trim().split(/\s+/).slice(0, 3).join(" "));
  }
  return items;
}

function searchLocalAcervo(query: string, limit: number) {
  const acervoRoot = path.join(process.cwd(), "acervo");
  if (!fs.existsSync(acervoRoot)) return [];
  const tokens = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  const results: Array<{
    source: string;
    kind: "image";
    title: string;
    url: string;
    thumbnail: string;
    width: number;
    height: number;
  }> = [];

  const entries = fs.readdirSync(acervoRoot, { withFileTypes: true });
  for (const dirEntry of entries) {
    if (!dirEntry.isDirectory()) continue;
    const folderName = dirEntry.name;
    const folderNorm = folderName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const folderHit = tokens.some((t) => folderNorm.includes(t));
    const folderPath = path.join(acervoRoot, folderName);
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !/\.(jpg|jpeg|png|webp)$/i.test(f.name)) continue;
      const fileNorm = f.name.toLowerCase();
      if (!folderHit && !tokens.some((t) => fileNorm.includes(t))) continue;
      const apiUrl = `/api/acervo/imagem?pasta=${encodeURIComponent(folderName)}&arquivo=${encodeURIComponent(f.name)}`;
      results.push({
        source: "acervo-local",
        kind: "image",
        title: `${folderName} · ${f.name}`,
        url: `local-acervo://${folderName}/${f.name}`,
        thumbnail: apiUrl,
        width: 0,
        height: 0,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function sanitizeSlug(input: string) {
  return (input || "projeto")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "projeto";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "download" ? "download" : "search";

  if (action === "search") {
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const kind = body?.kind === "image" || body?.kind === "video" ? body.kind : "both";
    const limit = Math.max(1, Math.min(12, Number(body?.limit) || 6));
    if (!query) {
      return Response.json({ erro: "Informe a query de busca da cena." }, { status: 400 });
    }

    const localItems = kind === "video" ? [] : searchLocalAcervo(query, Math.min(limit, 3));
    let pythonErr = "";
    try {
      const { data: result, runner } = await runPython(["search", "--query", query, "--kind", kind, "--limit", String(limit)], 45_000);
      if (result?.ok) {
        const merged = [...localItems, ...(Array.isArray(result.items) ? result.items : [])];
        return Response.json({ ...result, items: merged, runner });
      }
      pythonErr = result?.error || "Retorno inválido do Python.";
    } catch (err) {
      pythonErr = err instanceof Error ? err.message : String(err);
    }

    const webItems =
      kind === "video"
        ? []
        : [
            ...(await fallbackBingSearch(query, limit)),
            ...(await fallbackWallhavenSearch(query, limit)),
          ].slice(0, limit);
    const items = [...localItems, ...webItems];
    return Response.json({
      ok: true,
      query,
      items,
      runner: "fallback-bing-wallhaven",
      aviso: items.length > 0 ? undefined : `Python/yt-dlp indisponível (${pythonErr}).`,
    });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const kind = body?.kind === "video" ? "video" : "image";
  const projectSlug = sanitizeSlug(typeof body?.projectSlug === "string" ? body.projectSlug : "studio");
  const sceneIndex = Math.max(1, Number(body?.sceneIndex) || 1);
  const startSec = Math.max(0, Number(body?.startSec) || 0);
  const durationSec = Math.max(1, Math.min(30, Number(body?.durationSec) || 6));

  if (!url) {
    return Response.json({ erro: "URL da mídia não informada." }, { status: 400 });
  }

  const ext = kind === "video" ? "mp4" : url.toLowerCase().includes(".png") ? "png" : "jpg";
  const relDir = path.join("studio", projectSlug);
  const absDir = path.join(process.cwd(), "public", relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const fileName = `cena-${String(sceneIndex).padStart(2, "0")}-${Date.now()}.${ext}`;
  const outAbs = path.join(absDir, fileName);

  if (url.startsWith("local-acervo://")) {
    const rel = url.slice("local-acervo://".length);
    const srcAbs = path.resolve(process.cwd(), "acervo", rel);
    const acervoRoot = path.resolve(process.cwd(), "acervo");
    if (!srcAbs.startsWith(acervoRoot + path.sep) || !fs.existsSync(srcAbs)) {
      return Response.json({ erro: "Arquivo do acervo local não encontrado." }, { status: 404 });
    }
    fs.copyFileSync(srcAbs, outAbs);
    return Response.json({
      ok: true,
      publicUrl: `/studio/${projectSlug}/${fileName}`,
      fileName,
      kind: "image",
      bytes: fs.statSync(outAbs).size,
      runner: "acervo-local",
    });
  }

  try {
    const { data: result, runner } = await runPython(
      [
        "download",
        "--url",
        url,
        "--kind",
        kind,
        "--out",
        outAbs,
        "--start",
        String(startSec),
        "--duration",
        String(durationSec),
      ],
      180_000,
    );
    if (!result?.ok) {
      return Response.json({ erro: result?.error || "Falha ao baixar a mídia." }, { status: 500 });
    }
    return Response.json({
      ok: true,
      publicUrl: `/studio/${projectSlug}/${fileName}`,
      fileName,
      kind,
      bytes: result.bytes ?? 0,
      runner,
    });
  } catch (err) {
    if (kind === "image") {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(25_000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(outAbs, buf);
          return Response.json({
            ok: true,
            publicUrl: `/studio/${projectSlug}/${fileName}`,
            fileName,
            kind,
            bytes: buf.length,
          });
        }
        return Response.json(
          { erro: `Servidor da imagem retornou HTTP ${res.status} ao baixar.` },
          { status: 502 },
        );
      } catch (fetchErr) {
        return Response.json(
          { erro: `Falha ao baixar imagem: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}` },
          { status: 502 },
        );
      }
    }
    return Response.json(
      { erro: err instanceof Error ? err.message : "Erro ao baixar mídia da cena." },
      { status: 500 },
    );
  }
}
