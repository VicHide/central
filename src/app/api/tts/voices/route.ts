import { getVoiceStudioConfig } from "@/core/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cfg = getVoiceStudioConfig();
  const baseUrl = (searchParams.get("url")?.trim() || cfg.url).replace(/\/+$/, "");

  try {
    const res = await fetch(`${baseUrl}/v1/audio/voices`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) {
      return Response.json(
        { ok: false, voices: [], erro: `VoiceStudio retornou HTTP ${res.status} em /v1/audio/voices.` },
        { status: res.status },
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      voices?: Array<{ voice_id?: string; id?: string; name?: string; type?: string; language?: string }>;
    };
    const voices = (data.voices ?? [])
      .map((v) => ({
        id: v.voice_id || v.id || "",
        name: v.name || v.voice_id || v.id || "Sem nome",
        type: v.type || "voice",
      }))
      .filter((v) => v.id);

    return Response.json({ ok: true, baseUrl, voices });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        voices: [],
        erro: `Não foi possível listar vozes em ${baseUrl} (${err instanceof Error ? err.message : String(err)}).`,
      },
      { status: 502 },
    );
  }
}
