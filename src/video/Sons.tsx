import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { TICS_ANTES_DO_FIM } from "../config";

// Toca um efeito de public/ a partir de um quadro (relativo à cena em que está).
export const Efeito: React.FC<{ src: string; de: number; volume?: number; dur?: number }> = ({ src, de, volume = 0.6, dur = 45 }) => (
  <Sequence from={Math.max(0, de)} durationInFrames={dur}>
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

// Tic-tac que acelera nos últimos segundos antes de `fimFrame`.
export const Tics: React.FC<{ fimFrame: number }> = ({ fimFrame }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {TICS_ANTES_DO_FIM.map((s, i) => (
        <Efeito key={i} src={i % 2 === 0 ? "sfx/tick.wav" : "sfx/tock.wav"} de={Math.round(fimFrame - s * fps)} dur={Math.round(0.3 * fps)} volume={0.75} />
      ))}
    </>
  );
};

export type MusicaProps = { arquivo: string | null; volume: number };

// Música de fundo em loop, com entrada e saída suaves.
export const Musica: React.FC<{ musica?: MusicaProps }> = ({ musica }) => {
  const { durationInFrames, fps } = useVideoConfig();
  if (!musica?.arquivo) return null;
  const v = musica.volume;
  return (
    <Audio
      src={staticFile(musica.arquivo)}
      loop
      volume={(f) => v * Math.max(0, Math.min(1, f / (1.5 * fps), (durationInFrames - f) / (2 * fps)))}
    />
  );
};
