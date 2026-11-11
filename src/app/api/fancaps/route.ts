import { callFanCapsApi } from "@/server/fancaps";
import { syncFanCapsJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "queue";
  const query = new URLSearchParams(url.searchParams);
  query.delete("resource");
  try {
    const response = await callFanCapsApi("/" + resource + (query.size ? "?" + query.toString() : ""), "GET");
    if (resource === "queue" && response.ok) {
      const snapshot = await response.clone().json();
      if (snapshot && snapshot.totals && Array.isArray(snapshot.items)) syncFanCapsJob(snapshot);
    }
    return response;
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço Python indisponível." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "queue");
  delete body.action;
  try {
    const response = await callFanCapsApi("/" + action, "POST", body);
    if (response.ok && ["start", "pause", "resume", "clear", "remove", "move"].includes(action)) {
      const snapshot = await (await callFanCapsApi("/queue", "GET")).json();
      if (snapshot && snapshot.totals && Array.isArray(snapshot.items)) syncFanCapsJob(snapshot);
    }
    return response;
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço Python indisponível." }, { status: 503 });
  }
}
