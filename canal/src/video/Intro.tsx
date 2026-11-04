import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadRusso } from "@remotion/google-fonts/RussoOne";
import { FPS, INK, PAPEL } from "./Quiz";
import { INTRO_SEG } from "../config";

const bangers = loadBangers("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const russo = loadRusso("normal", { weights: ["400"], subsets: ["cyrillic", "latin"] }).fontFamily;
const FONTE = `${bangers}, ${russo}, Impact, sans-serif`;

export const INTRO_FRAMES = INTRO_SEG * FPS;

export type IntroProps = {
  modo: "zoom" | "quatro";
  promos: (string | null)[]; // caminhos dentro de /public; null = placeholder
};

type Idioma = "us" | "es" | "br" | "fr" | "ru";
const CORES = ["#ff7a93", "#ffd166", "#7ae582", "#4cc9f0", "#c8a2ff"];

const TEXTOS: Record<IntroProps["modo"], { c: Idioma; l: [string, string, string] }[]> = {
  quatro: [
    { c: "us", l: ["GUESS THE ANIME", "FROM 4 IMAGES", "(HARD → SUPER EASY)"] },
    { c: "es", l: ["ADIVINA EL ANIME", "CON 4 IMÁGENES", "(DIFÍCIL → SÚPER FÁCIL)"] },
    { c: "br", l: ["ADIVINHE O ANIME", "COM 4 IMAGENS", "(DIFÍCIL → SUPERFÁCIL)"] },
    { c: "fr", l: ["DEVINE L’ANIME", "AVEC 4 IMAGES", "(DIFFICILE → TRÈS FACILE)"] },
    { c: "ru", l: ["УГАДАЙ АНИМЕ", "ПО 4 КАРТИНКАМ", "(СЛОЖНО → ОЧЕНЬ ЛЕГКО)"] },
  ],
  zoom: [
    { c: "us", l: ["GUESS THE ANIME", "FROM THE ZOOMED IMAGE", "(ZOOM → FULL PICTURE)"] },
    { c: "es", l: ["ADIVINA EL ANIME", "POR LA IMAGEN AMPLIADA", "(ZOOM → IMAGEN COMPLETA)"] },
    { c: "br", l: ["ADIVINHE O ANIME", "PELA IMAGEM COM ZOOM", "(ZOOM → IMAGEM COMPLETA)"] },
    { c: "fr", l: ["DEVINE L’ANIME", "GRÂCE À L’IMAGE ZOOMÉE", "(ZOOM → IMAGE ENTIÈRE)"] },
    { c: "ru", l: ["УГАДАЙ АНИМЕ", "ПО УВЕЛИЧЕННОЙ КАРТИНКЕ", "(ЗУМ → ВСЯ КАРТИНКА)"] },
  ],
};

// Bandeiras simplificadas em SVG (não dependem de fonte de emoji).
const Bandeira: React.FC<{ c: Idioma }> = ({ c }) => {
  const arte: Record<Idioma, React.ReactNode> = {
    us: (<>
      <rect width="60" height="40" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 40) / 13} width="60" height={40 / 13} fill="#b22234" />)}
      <rect width="26" height="21.5" fill="#3c3b6e" />
    </>),
    es: (<><rect width="60" height="40" fill="#c60b1e" /><rect y="10" width="60" height="20" fill="#ffc400" /></>),
    br: (<><rect width="60" height="40" fill="#009c3b" /><polygon points="30,4 56,20 30,36 4,20" fill="#ffdf00" /><circle cx="30" cy="20" r="8" fill="#002776" /></>),
    fr: (<><rect width="20" height="40" fill="#0055a4" /><rect x="20" width="20" height="40" fill="#fff" /><rect x="40" width="20" height="40" fill="#ef4135" /></>),
    ru: (<><rect width="60" height="40" fill="#fff" /><rect y="13.3" width="60" height="13.4" fill="#0039a6" /><rect y="26.7" width="60" height="13.3" fill="#d52b1e" /></>),
  };
  return (
    <div style={{ width: 140, height: 140, flex: "none", borderRadius: "50%", overflow: "hidden", border: `8px solid ${PAPEL}`, boxShadow: `0 6px 0 ${INK}`, boxSizing: "border-box" }}>
      <svg viewBox="0 0 60 40" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">{arte[c]}</svg>
    </div>
  );
};

const Promo: React.FC<{ src: string | null; idx: number; local: number; entra: boolean }> = ({ src, idx, local, entra }) => {
  const { fps } = useVideoConfig();
  const e = entra ? spring({ frame: local, fps, durationInFrames: 16, config: { damping: 200 } }) : 1;
  const k = interpolate(local, [0, 60], [1.14, 1.04], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, opacity: e, transform: `translateX(${(1 - e) * 220}px) scale(${k})` }}>
      {src ? (
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(${150 + idx * 40}deg, #ff5d73, #5a3ea8)`, fontFamily: FONTE, fontSize: 90, color: PAPEL, WebkitTextStroke: `8px ${INK}`, paintOrder: "stroke fill" }}>
          PROMO {idx + 1}
        </div>
      )}
    </div>
  );
};

export const Intro: React.FC<IntroProps> = ({ modo, promos }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lista = promos.length ? promos : [null];
  const slot = Math.round(1.7 * fps);
  const el = Math.max(0, frame - 6);
  const c = Math.floor(el / slot);
  const forma = "polygon(16% 0, 100% 0, 100% 100%, 0 100%)";
  const txt: React.CSSProperties = { fontFamily: FONTE, WebkitTextStroke: `6px ${INK}`, paintOrder: "stroke fill", lineHeight: 1.08, letterSpacing: 1 };

  return (
    <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * 0.25}deg at 35% 50%, #3a1d7a 0deg 9deg, #4a2a94 9deg 18deg)` }}>
      {TEXTOS[modo].map((t, i) => {
        const p = spring({ frame: frame - (10 + i * 9), fps, config: { damping: 13, stiffness: 120 } });
        return (
          <div key={i} style={{ position: "absolute", left: 48, top: 50 + i * 199, width: 1080, height: 184, display: "flex", alignItems: "center", gap: 28, padding: "0 28px", boxSizing: "border-box", borderRadius: 92, background: "linear-gradient(90deg, rgba(255,255,255,.18), rgba(255,255,255,.04))", opacity: Math.min(1, p), transform: `translateX(${(1 - p) * -700}px)` }}>
            <Bandeira c={t.c} />
            <div style={{ flex: 1, textAlign: "center", ...txt }}>
              <div style={{ color: CORES[i], fontSize: 46 }}>{t.l[0]}</div>
              <div style={{ color: PAPEL, fontSize: 46 }}>{t.l[1]}</div>
              <div style={{ color: CORES[i], fontSize: 38 }}>{t.l[2]}</div>
            </div>
          </div>
        );
      })}

      {/* Faixa de promos passando à direita */}
      <div style={{ position: "absolute", left: 1040, top: 0, width: 880, height: 1080, background: PAPEL, clipPath: forma }} />
      <div style={{ position: "absolute", left: 1060, top: 0, width: 860, height: 1080, clipPath: forma, overflow: "hidden", background: INK }}>
        {c > 0 && <Promo key={c - 1} src={lista[(c - 1) % lista.length]} idx={(c - 1) % lista.length} local={slot} entra={false} />}
        <Promo key={c} src={lista[c % lista.length]} idx={c % lista.length} local={el - c * slot} entra={c > 0 || el > 0} />
      </div>
    </AbsoluteFill>
  );
};
