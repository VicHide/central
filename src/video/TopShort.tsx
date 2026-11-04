import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, INK, PAPEL, contorno } from "./Quiz";
import { TOP_INTRO_SEG, TOP_ITEM_SEG, TOP_FIM_SEG } from "../config";

export type ItemTop = { rank: number; titulo: string; nota: number | null; generos: string[]; estudio: string | null; episodios: number | null; capa: string | null };
export type TopProps = { titulo: string; subtitulo: string; itens: ItemTop[]; fonte: string };

const f = (seg: number) => Math.round(seg * FPS);
export const duracaoTop = (p: TopProps) => f(TOP_INTRO_SEG) + p.itens.length * f(TOP_ITEM_SEG) + f(TOP_FIM_SEG);

const OURO = "#ffd166";
const fundo = (frame: number): React.CSSProperties => ({
  background: `repeating-conic-gradient(from ${frame * 0.25}deg at 50% 40%, #3a1d7a 0deg 9deg, #4a2a94 9deg 18deg)`,
});

const Estrela: React.FC<{ t: number }> = ({ t }) => (
  <svg width={t} height={t} viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" fill={OURO} stroke={INK} strokeWidth="1.5" /></svg>
);

const Abertura: React.FC<{ titulo: string; subtitulo: string }> = ({ titulo, subtitulo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ ...fundo(frame), alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])}) rotate(-2deg)`, textAlign: "center" }}>
        <div style={{ ...contorno(1.6), fontSize: 150, lineHeight: 1.05 }}>{titulo}</div>
        {subtitulo && <div style={{ ...contorno(1), fontSize: 64, marginTop: 36, color: OURO }}>{subtitulo.toUpperCase()}</div>}
      </div>
    </AbsoluteFill>
  );
};

const Item: React.FC<{ it: ItemTop; k: number; total: number }> = ({ it, k, total }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 140 } });
  const capaPop = spring({ frame: frame - 3, fps, config: { damping: 14, stiffness: 110 } });
  const sai = interpolate(frame, [durationInFrames - 5, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const valor = it.nota === null ? null : interpolate(frame, [10, 34], [0, it.nota / 10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ouro = it.rank === 1;
  const borda = ouro ? OURO : PAPEL;
  const chip: React.CSSProperties = { ...contorno(0.5), fontSize: 38, background: PAPEL, color: INK, WebkitTextStroke: "0", padding: "8px 24px", borderRadius: 999, border: `5px solid ${INK}` };

  return (
    <AbsoluteFill style={{ ...fundo(frame), opacity: sai }}>
      <div style={{ position: "absolute", left: 220, top: 230, width: 640, height: 960, borderRadius: 36, border: `14px solid ${borda}`, boxShadow: `0 18px 0 ${INK}`, overflow: "hidden", background: INK, transform: `scale(${interpolate(capaPop, [0, 1], [0.7, 1])}) rotate(${interpolate(capaPop, [0, 1], [-4, 0])}deg)` }}>
        {it.capa ? <Img src={staticFile(it.capa)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #ff5d73, #5a3ea8)", ...contorno(1.4), fontSize: 120 }}>CAPA</div>
        )}
      </div>

      <div style={{ position: "absolute", left: 40, top: 170, width: 250, height: 250, borderRadius: "50%", background: ouro ? OURO : "#ff5d73", border: `12px solid ${PAPEL}`, boxShadow: `0 10px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${pop})`, ...contorno(1.5), fontSize: it.rank === 10 ? 110 : 140 }}>#{it.rank}</div>

      <div style={{ position: "absolute", left: 60, width: 960, top: 1250, textAlign: "center" }}>
        {ouro && <div style={{ ...contorno(0.9), fontSize: 46, color: OURO, marginBottom: 8 }}>NÚMERO 1</div>}
        <div style={{ ...contorno(1.1), fontSize: 74, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.titulo.toUpperCase()}</div>
      </div>

      <div style={{ position: "absolute", left: 40, width: 1000, top: 1520, display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        {valor !== null && <div style={{ ...chip, display: "flex", alignItems: "center", gap: 10, background: OURO }}><Estrela t={42} />{valor.toFixed(1)}</div>}
        {it.generos.map((g) => <div key={g} style={chip}>{g.toUpperCase()}</div>)}
      </div>
      <div style={{ position: "absolute", left: 40, width: 1000, top: 1650, textAlign: "center", ...contorno(0.5), fontSize: 40 }}>
        {[it.estudio, it.episodios ? `${it.episodios} EPISÓDIOS` : null].filter(Boolean).join(" · ").toUpperCase()}
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 90, display: "flex", gap: 14, justifyContent: "center" }}>
        {Array.from({ length: total }, (_, i) => <div key={i} style={{ width: 34, height: 34, borderRadius: "50%", border: `5px solid ${PAPEL}`, background: i <= k ? (i === total - 1 ? OURO : PAPEL) : "transparent" }} />)}
      </div>
    </AbsoluteFill>
  );
};

const Fim: React.FC<{ fonte: string }> = ({ fonte }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill style={{ ...fundo(frame), alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])})`, textAlign: "center" }}>
        <div style={{ ...contorno(1.6), fontSize: 130 }}>QUAL É O SEU NÚMERO 1?</div>
        <div style={{ ...contorno(1), fontSize: 60, marginTop: 40, color: OURO }}>COMENTE AÍ</div>
      </div>
      <div style={{ position: "absolute", bottom: 90, ...contorno(0.5), fontSize: 36 }}>{fonte.toUpperCase()}</div>
    </AbsoluteFill>
  );
};

export const TopShort: React.FC<TopProps> = (p) => {
  const ordem = [...p.itens].sort((a, b) => b.rank - a.rank); // contagem regressiva
  const fi = f(TOP_INTRO_SEG), fx = f(TOP_ITEM_SEG);
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={fi}><Abertura titulo={p.titulo} subtitulo={p.subtitulo} /></Sequence>
      {ordem.map((it, k) => (
        <Sequence key={it.rank} from={fi + k * fx} durationInFrames={fx}><Item it={it} k={k} total={ordem.length} /></Sequence>
      ))}
      <Sequence from={fi + ordem.length * fx} durationInFrames={f(TOP_FIM_SEG)}><Fim fonte={p.fonte} /></Sequence>
    </AbsoluteFill>
  );
};
