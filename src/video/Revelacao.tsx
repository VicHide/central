import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Bangers";

const fonte = loadFont("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const INK = "#1b1033";
const PAPEL = "#fff8e7";
const OURO = "#ffd166";

export type DadosRevelacao = { numero: number; anime: string; imagens: (string | null)[]; capa?: string | null; nota?: number | null; generos?: string[]; ano?: number | null; formato?: string | null; estudio?: string | null };

const FORMATO_PT: Record<string, string> = { TV: "TV", TV_SHORT: "TV CURTO", MOVIE: "FILME", OVA: "OVA", ONA: "ONA" };

// Formas que flutuam ao redor (posição em % da tela).
const FORMAS: [number, number, "anel" | "mais" | "quadrado" | "triangulo", string, number][] = [
  [8, 18, "anel", "#ff7a93", 46], [24, 8, "mais", "#4cc9f0", 40], [88, 16, "quadrado", "#ff5d73", 44],
  [94, 52, "triangulo", "#ffd166", 46], [5, 58, "mais", "#7ae582", 38], [15, 88, "anel", "#4cc9f0", 40],
  [80, 90, "anel", "#7ae582", 44], [62, 5, "triangulo", "#ff7a93", 38], [97, 82, "quadrado", "#4cc9f0", 36],
  [38, 94, "mais", "#ffd166", 40], [3, 38, "quadrado", "#ffd166", 34], [71, 62, "anel", "#ffd166", 30],
];

const Forma: React.FC<{ tipo: string; cor: string; t: number }> = ({ tipo, cor, t }) => {
  const camadas = [[INK, 22], [cor, 10]] as const;
  return (
    <svg width={t} height={t} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      {camadas.map(([c, w], i) => (
        <g key={i} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
          {tipo === "anel" && <circle cx="50" cy="50" r="34" />}
          {tipo === "mais" && <path d="M50 14 V86 M14 50 H86" />}
          {tipo === "quadrado" && <rect x="18" y="18" width="64" height="64" rx="10" />}
          {tipo === "triangulo" && <polygon points="50,14 88,82 12,82" />}
        </g>
      ))}
    </svg>
  );
};

const Estrela: React.FC<{ t: number }> = ({ t }) => (
  <svg width={t} height={t} viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" fill={OURO} stroke={INK} strokeWidth="1.5" /></svg>
);

// Letra com contorno grosso e preenchimento em degradê.
const Letra: React.FC<{ c: string; tam: number }> = ({ c, tam }) => (
  <span style={{ position: "relative", display: "inline-block", fontFamily: fonte, fontSize: tam, lineHeight: 1, whiteSpace: "pre" }}>
    <span style={{ WebkitTextStroke: `${tam * 0.16}px ${INK}`, color: INK }}>{c}</span>
    <span style={{ position: "absolute", left: 0, top: 0, background: "linear-gradient(180deg, #fff1a8 10%, #ffb703 60%, #ff7a1a 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{c}</span>
  </span>
);

export const Revelacao: React.FC<{ p: DadosRevelacao; frame: number; canal: string }> = ({ p, frame, canal }) => {
  const { fps } = useVideoConfig();
  const mola = (inicio: number, damping = 12) => spring({ frame: frame - inicio, fps, config: { damping, stiffness: 130 } });

  const abre = interpolate(spring({ frame, fps, durationInFrames: 14, config: { damping: 200 } }), [0, 1], [0, 80]);
  const raioOp = interpolate(frame, [0, 18], [0.95, 0], { extrapolateRight: "clamp" });
  const raioEsc = interpolate(frame, [0, 18], [0.2, 1.7], { extrapolateRight: "clamp" });
  const imagem = p.imagens[3] ?? p.imagens[0] ?? null; // a dica mais fácil, inteira
  const poster = p.capa ?? p.imagens[0] ?? null;
  const cartao = mola(6, 11);
  const titulo = p.anime.toUpperCase();
  const tam = Math.min(140, (1380 / Math.max(6, titulo.length)) * 1.75);
  const pillIn = mola(10);
  const nota = typeof p.nota === "number" ? p.nota : null;

  return (
    <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * 0.3}deg at 58% 46%, #ffb347 0deg 8deg, #ff9f1c 8deg 16deg)` }}>
      {/* Explosão de raios na abertura da cena */}
      <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: raioOp, transform: `scale(${raioEsc})`, transformOrigin: "1110px 500px" }}>
        {Array.from({ length: 18 }, (_, i) => {
          const a1 = (i / 18) * Math.PI * 2, a2 = ((i + 0.5) / 18) * Math.PI * 2;
          return <polygon key={i} fill={i % 2 ? "#ffffff" : OURO} points={`1110,500 ${1110 + 1500 * Math.cos(a1)},${500 + 1500 * Math.sin(a1)} ${1110 + 1500 * Math.cos(a2)},${500 + 1500 * Math.sin(a2)}`} />;
        })}
      </svg>

      {/* Formas flutuantes */}
      {FORMAS.map(([x, y, tipo, cor, t], i) => {
        const e = mola(8 + i * 2, 10);
        return (
          <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: `translate(${Math.sin(frame / 18 + i) * 10}px, ${Math.cos(frame / 22 + i) * 12}px) rotate(${frame * (i % 2 ? 2 : -2)}deg) scale(${Math.max(0, e)})` }}>
            <Forma tipo={tipo} cor={cor} t={t} />
          </div>
        );
      })}

      {/* Moldura com a imagem inteira, abrindo em círculo */}
      <div style={{ position: "absolute", left: 420, top: 110, width: 1380, height: 776, borderRadius: 56, border: `16px solid ${PAPEL}`, boxShadow: `0 16px 0 ${INK}`, boxSizing: "content-box", marginLeft: -16, marginTop: -16, overflow: "hidden", background: INK, clipPath: `circle(${abre}% at 50% 50%)` }}>
        <div style={{ width: "100%", height: "100%", transform: `scale(${interpolate(frame, [0, 24], [1.25, 1], { extrapolateRight: "clamp" })})` }}>
          {imagem ? <Img src={staticFile(imagem)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #4cc9f0, #5a3ea8)" }} />
          )}
        </div>
      </div>

      {/* Cartão da capa, sobrepondo a moldura */}
      <div style={{ position: "absolute", left: 110, top: 290, width: 340, height: 510, borderRadius: 30, border: `12px solid ${PAPEL}`, boxShadow: `0 12px 0 ${INK}`, boxSizing: "border-box", overflow: "hidden", background: INK, transform: `translateX(${(1 - Math.min(1, cartao)) * -520}px) rotate(${-3 - (1 - Math.min(1, cartao)) * 10}deg)` }}>
        {poster ? <Img src={staticFile(poster)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #ff5d73, #5a3ea8)", fontFamily: fonte, fontSize: 70, color: PAPEL }}>CAPA</div>
        )}
      </div>

      {/* Informações do AniList no topo: gêneros e nota */}
      {((p.generos?.length ?? 0) > 0 || nota !== null) && (
        <div style={{ position: "absolute", top: 44, left: 420, width: 1380, display: "flex", justifyContent: "center", alignItems: "center", gap: 16, opacity: Math.min(1, pillIn), transform: `translateY(${(1 - Math.min(1, pillIn)) * -70}px)` }}>
          {(p.generos?.length ?? 0) > 0 && <div style={{ fontFamily: fonte, fontSize: 44, color: PAPEL, background: "#ff5d73", border: `8px solid ${PAPEL}`, borderRadius: 999, padding: "6px 36px", boxShadow: `0 6px 0 ${INK}`, WebkitTextStroke: `4px ${INK}`, paintOrder: "stroke fill" }}>{(p.generos ?? []).join(" · ").toUpperCase()}</div>}
          {(p.generos?.length ?? 0) > 0 && nota !== null ? <Estrela t={64} /> : null}
          {nota !== null && <div style={{ fontFamily: fonte, fontSize: 44, color: INK, background: OURO, border: `8px solid ${PAPEL}`, borderRadius: 999, padding: "6px 36px", boxShadow: `0 6px 0 ${INK}` }}>ANILIST {nota.toFixed(1)}/10</div>}
        </div>
      )}

      {/* Ano, formato e estúdio embaixo do cartão da capa */}
      {(p.ano || p.formato || p.estudio) && (
        <div style={{ position: "absolute", left: 48, top: 842, width: 380, textAlign: "center", fontFamily: fonte, fontSize: 36, lineHeight: 1.15, color: PAPEL, WebkitTextStroke: `7px ${INK}`, paintOrder: "stroke fill", opacity: Math.min(1, pillIn) }}>
          <div>{[p.ano, p.formato ? FORMATO_PT[p.formato] ?? p.formato : null].filter(Boolean).join(" · ")}</div>
          {p.estudio && <div style={{ fontSize: 28 }}>{p.estudio.toUpperCase()}</div>}
        </div>
      )}

      {/* Título: letra por letra, com pulinho */}
      <div style={{ position: "absolute", left: 420, width: 1380, top: 898, display: "flex", justifyContent: "center", alignItems: "center" }}>
        {[...titulo].map((c, i) => {
          const e = mola(14 + i * 2, 9);
          const pulo = e >= 0.98 ? Math.sin((frame - i * 3) / 6) * 4 : 0;
          return (
            <div key={i} style={{ transform: `translateY(${(1 - Math.min(1, e)) * 90 + pulo}px) scale(${0.4 + 0.6 * Math.min(1, Math.max(0, e))}) rotate(${(1 - Math.min(1, e)) * (i % 2 ? 14 : -14)}deg)`, opacity: Math.min(1, Math.max(0, e * 2)) }}>
              <Letra c={c} tam={tam} />
            </div>
          );
        })}
      </div>

      {/* Número da pergunta, mascote e canal */}
      <div style={{ position: "absolute", top: 36, left: 48, width: 110, height: 110, borderRadius: "50%", background: "#ff5d73", border: `10px solid ${PAPEL}`, boxShadow: `0 8px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonte, fontSize: 64, color: PAPEL, WebkitTextStroke: `5px ${INK}`, paintOrder: "stroke fill" }}>{p.numero}</div>
      <div style={{ position: "absolute", top: 36, right: 48, width: 110, height: 110, borderRadius: "50%", background: PAPEL, border: `6px dashed ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: fonte, fontSize: 20, color: INK }}>SEU MASCOTE</div>
      <div style={{ position: "absolute", left: 48, bottom: 36, fontFamily: fonte, fontSize: 42, color: PAPEL, WebkitTextStroke: `6px ${INK}`, paintOrder: "stroke fill" }}>{canal}</div>
    </AbsoluteFill>
  );
};
