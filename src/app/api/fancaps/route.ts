import { callFanCapsApi } from "@/server/fancaps";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "queue";
  const query = new URLSearchParams(url.searchParams);
  query.delete("resource");
  try {
    return await callFanCapsApi("/" + resource + (query.size ? "?" + query.toString() : ""), "GET");
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço Python indisponível." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "queue");
  delete body.action;
  try {
    return await callFanCapsApi("/" + action, "POST", body);
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço Python indisponível." }, { status: 503 });
  }
}
