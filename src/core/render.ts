import fs from "node:fs";
import path from "node:path";

export type Evento = (o: { etapa: string; pct: number; eta?: number; detalhe?: string }) => void;

// Empacota o projeto e renderiza uma composição, informando o progresso (10% a 100%).
export async function renderVideo(id: string, saida: string, evento: Evento, inputProps?: Record<string, unknown>) {
  const RAIZ = process.cwd();
  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, renderMedia } = await import("@remotion/renderer");
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  let ultimo = -1;
  evento({ etapa: "Empacotando o projeto", pct: 10 });
  const serveUrl = await bundle({
    entryPoint: path.join(RAIZ, "src", "video", "index.ts"),
    publicDir: path.join(RAIZ, "public"),
    onProgress: (p) => {
      const pct = 10 + Math.round(p / 10);
      if (pct !== ultimo) { ultimo = pct; evento({ etapa: "Empacotando o projeto", pct }); }
    },
  });
  evento({ etapa: "Preparando o render (na primeira vez baixa o navegador)", pct: 20 });
  const composition = await selectComposition({ serveUrl, id, inputProps });
  const inicio = Date.now();
  ultimo = -1;
  await renderMedia({
    composition, serveUrl, codec: "h264", outputLocation: saida, ...(inputProps ? { inputProps } : {}),
    onProgress: ({ progress, renderedFrames }) => {
      const pct = 20 + Math.round(progress * 80);
      if (pct === ultimo) return;
      ultimo = pct;
      const eta = progress > 0.02 ? Math.round((((Date.now() - inicio) / progress) * (1 - progress)) / 1000) : undefined;
      evento({ etapa: "Renderizando o vídeo", pct, eta, detalhe: `${renderedFrames}/${composition.durationInFrames} quadros` });
    },
  });
}
