export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ erro: "Configure ELEVENLABS_API_KEY no arquivo .env.local e reinicie o painel." }, { status: 503 });
  }

  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  }).catch(() => null);

  if (!response) return Response.json({ erro: "Não foi possível conectar à ElevenLabs." }, { status: 502 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail?.message ?? data?.detail;
    return Response.json({ erro: typeof detail === "string" ? detail : "A ElevenLabs não conseguiu listar suas vozes." }, { status: response.status });
  }

  const voices = Array.isArray(data.voices) ? data.voices.map((voice: {
    voice_id?: string; name?: string; category?: string; labels?: Record<string, string>;
  }) => ({
    voice_id: voice.voice_id,
    name: voice.name,
    category: voice.category,
    labels: voice.labels ?? {},
  })).filter((voice: { voice_id?: string; name?: string }) => voice.voice_id && voice.name) : [];

  return Response.json({ voices });
}
