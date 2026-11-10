import { callFanCapsApi } from "@/server/fancaps";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await callFanCapsApi("/frames", "GET");
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço de análise indisponível." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action === "delete" ? "delete" : "analyze";
  try {
    const response = await callFanCapsApi("/frames/" + action, "POST", body);
    return response;
  } catch (error) {
    return Response.json({ erro: error instanceof Error ? error.message : "Serviço de análise indisponível." }, { status: 503 });
  }
}
