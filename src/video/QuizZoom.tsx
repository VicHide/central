import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, INK, PAPEL, contorno, Resposta } from "./Quiz";
import { Efeito, Tics, Musica, MusicaProps } from "./Sons";

// x e y em % da imagem (0-100): o ponto que fica no centro. zoom 1 = imagem inteira.
export type Corte = { x: number; y: number; zoom: number };
export type PerguntaZoom = {
  numero: number;
  anime: string;
  imagem: string | null; // caminho dentro de /public, ex.: "imagens/q1.jpg"
  cortes: Corte[]; // etapas de zoom; a imagem inteira entra no final
};
export type ZoomProps = {
  perguntas: PerguntaZoom[];
  segPorCorte: number;
  segRevelacao: number;
  canal: string;
  transicao: "corte" | "suave";
  musica?: MusicaProps;
};

const INTEIRA: Corte = { x: 50, y: 50, zoom: 1 };
const passos = (p: PerguntaZoom) => [...p.cortes, INTEIRA];
const duracao = (p: PerguntaZoom, z: ZoomProps) =>
  Math.round(((p.cortes.length + 1) * z.segPorCorte + z.segRevelacao) * FPS);

export const duracaoZoom = (z: ZoomProps) =>
  Math.max(1, z.perguntas.reduce((soma, p) => soma + duracao(p, z), 0));

const Placeholder: React.FC<{ s: number }> = ({ s }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: `linear-gradient(135deg, #6b4bc4, #3a1d7a), repeating-linear-gradient(0deg, transparent 0 ${80 * s}px, rgba(255,255,255,.2) ${80 * s}px ${84 * s}px)`,
      backgroundBlendMode: "overlay",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...contorno(s),
      fontSize: 90 * s,
    }}
  >
    IMAGEM 16:9
    {[[20, 25, "#ff5d73"], [75, 30, "#ffb703"], [35, 75, "#4cc9f0"], [80, 70, "#7ae582"]].map(([x, y, c], i) => (
      <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 90 * s, height: 90 * s, marginLeft: -45 * s, marginTop: -45 * s, borderRadius: "50%", background: c as string, border: `${6 * s}px solid ${PAPEL}` }} />
    ))}
  </div>
);

const CenaZoom: React.FC<{ p: PerguntaZoom; z: ZoomProps }> = ({ p, z }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = Math.min(width, height) / 1080;
  const W = width > height ? width - 420 : width - 120;
  const H = (W * 9) / 16;
  const top = (height - H) / 2 - 30 * s;

  const ps = passos(p);
  const seg = z.segPorCorte * fps;
  const i = Math.min(ps.length - 1, Math.floor(frame / seg));
  const ant = ps[Math.max(0, i - 1)];
  const cur = ps[i];
  const t =
    z.transicao === "suave" && i > 0
      ? spring({ frame: frame - i * seg, fps, durationInFrames: 14, config: { damping: 200 } })
      : 1;
  const mix = (a: number, b: number) => a + (b - a) * t;
  const zoom = mix(ant.zoom, cur.zoom);
  const fx = mix(ant.x, cur.x) / 100;
  const fy = mix(ant.y, cur.y) / 100;
  const limX = ((zoom - 1) * W) / 2;
  const limY = ((zoom - 1) * H) / 2;
  const tx = Math.max(-limX, Math.min(limX, -zoom * (fx - 0.5) * W));
  const ty = Math.max(-limY, Math.min(limY, -zoom * (fy - 0.5) * H));

  const barra = interpolate(frame, [0, ps.length * seg], [0, 100], { extrapolateRight: "clamp" });
  const revelando = frame >= ps.length * seg;

  return (
    <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * 0.25}deg at 50% 45%, #3a1d7a 0deg 9deg, #4a2a94 9deg 18deg)` }}>
      {/* Moldura com a imagem e o zoom */}
      <div style={{ position: "absolute", left: (width - W) / 2, top, width: W, height: H, borderRadius: 40 * s, border: `${12 * s}px solid ${PAPEL}`, boxShadow: `0 ${14 * s}px 0 ${INK}`, overflow: "hidden", background: INK, boxSizing: "content-box", marginLeft: -12 * s, marginTop: -12 * s }}>
        <div style={{ position: "absolute", inset: 0, transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }}>
          {p.imagem ? <Img src={staticFile(p.imagem)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Placeholder s={s} />}
        </div>
      </div>

      {/* Número da pergunta */}
      <div style={{ position: "absolute", top: top - 40 * s, left: (width + W) / 2 - 100 * s, width: 120 * s, height: 120 * s, borderRadius: "50%", background: "#ff5d73", border: `${8 * s}px solid ${PAPEL}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 * s, ...contorno(s * 0.7) }}>
        {String(p.numero).padStart(2, "0")}
      </div>

      {/* Barra de tempo com espaço do mascote */}
      <div style={{ position: "absolute", left: (width - W) / 2, width: W, bottom: 44 * s, height: 56 * s, background: PAPEL, borderRadius: 40 * s, padding: 8 * s, boxShadow: `0 ${6 * s}px 0 ${INK}` }}>
        <div style={{ width: `${barra}%`, height: "100%", borderRadius: 32 * s, background: `repeating-linear-gradient(-45deg, #7ae582 0 ${16 * s}px, #4fc65a ${16 * s}px ${32 * s}px)` }} />
        <div style={{ position: "absolute", top: -22 * s, left: `calc(${barra}% - ${40 * s}px + ${8 * s}px)`, width: 80 * s, height: 80 * s, borderRadius: "50%", background: PAPEL, border: `${6 * s}px dashed ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 16 * s, color: INK, fontFamily: "Bangers, Impact, sans-serif" }}>
          MASCOTE
        </div>
      </div>

      {/* Nome do canal */}
      <div style={{ position: "absolute", left: (width - W) / 2, top: 28 * s, ...contorno(s * 0.5), fontSize: 40 * s }}>{z.canal}</div>

      {revelando && <Resposta nome={p.anime} frame={frame - ps.length * seg} s={s} />}

      {/* Áudio: entrada, cada etapa do zoom, tic-tac no fim e revelação */}
      <Efeito src="sfx/pop.wav" de={0} volume={0.5} />
      {ps.slice(1).map((_, k) => <Efeito key={k} src="sfx/whoosh.wav" de={(k + 1) * seg} volume={0.3} />)}
      <Tics fimFrame={ps.length * seg} />
      <Efeito src="sfx/reveal.wav" de={ps.length * seg} volume={0.6} />
    </AbsoluteFill>
  );
};

export const QuizZoom: React.FC<ZoomProps> = (z) => {
  let inicio = 0;
  return (
    <AbsoluteFill>
      <Musica musica={z.musica} />
      {z.perguntas.map((p) => {
        const d = duracao(p, z);
        const from = inicio;
        inicio += d;
        return (
          <Sequence key={p.numero} from={from} durationInFrames={d}>
            <CenaZoom p={p} z={z} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
