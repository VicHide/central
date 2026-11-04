const BANGUMI_API = "https://api.bgm.tv";
const UPSTREAM_TIMEOUT_MS = 10_000;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleBangumi(request);
}

export async function POST(request: Request) {
  return handleBangumi(request);
}

async function handleBangumi(request: Request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const currentUrl = new URL(request.url);
  const targetPath = normalizePath(currentUrl.searchParams.get("path") || "");

  if (!targetPath || !isAllowedPath(targetPath, request.method)) {
    return json({ error: "Bangumi API path is not allowed" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && body.length > 100_000) {
      return json({ error: "Request body is too large" }, 413);
    }

    const upstream = await fetch(new URL(targetPath, BANGUMI_API), {
      method: request.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "CentralDoCanal/1.0 (Bangumi metadata integration)",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error
      ? error.name === "AbortError" ? "Bangumi request timed out" : error.message
      : "Unknown upstream error";
    return json({ error: "Bangumi upstream request failed", detail }, 502);
  } finally {
    clearTimeout(timer);
  }
}

function normalizePath(value: string) {
  if (!value.startsWith("/")) return "";

  try {
    const url = new URL(value, BANGUMI_API);
    if (url.origin !== BANGUMI_API) return "";
    return `${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

function isAllowedPath(path: string, method: string) {
  const url = new URL(path, BANGUMI_API);
  const pathname = url.pathname;

  if (method === "GET" && /^\/v0\/subjects\/\d+$/.test(pathname)) return true;
  if (method === "GET" && /^\/v0\/subjects\/\d+\/characters$/.test(pathname) && !url.search) return true;
  if (method === "GET" && /^\/v0\/characters\/\d+$/.test(pathname) && !url.search) return true;

  if (method === "GET" && /^\/v0\/users\/[^/]+\/collections$/.test(pathname)) {
    return url.searchParams.get("subject_type") === "2"
      && url.searchParams.get("type") === "2"
      && boundedInteger(url.searchParams.get("limit"), 1, 50)
      && boundedInteger(url.searchParams.get("offset"), 0, 5000);
  }

  if (method === "POST" && pathname === "/v0/search/subjects") {
    return boundedInteger(url.searchParams.get("limit"), 1, 20)
      && boundedInteger(url.searchParams.get("offset"), 0, 200);
  }

  return false;
}

function boundedInteger(value: string | null, min: number, max: number) {
  if (!value || !/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
