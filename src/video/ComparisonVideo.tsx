import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type ComparisonSide = "left" | "right" | "none";
export type ComparisonExpression = "neutral" | "doubt" | "surprise";

export type ComparisonSegment = {
  durationInFrames: number;
  active: ComparisonSide;
  speech: string;
  expression?: ComparisonExpression;
  audio?: string;
  leftStill: string;
  rightStill: string;
  leftVideoFrom?: number;
  rightVideoFrom?: number;
  leftPauseFrame?: number;
  rightPauseFrame?: number;
};

export type ComparisonProps = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftVideo: string;
  rightVideo: string;
  segments: ComparisonSegment[];
};

const INK = "#171717";
const MUTED = "#666";
const ACCENT = "#f3c928";
const CAPTION_SPEED = 1.12;

function frasesDaLegenda(text: string) {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

function legendaNaFrame(text: string, frame: number, duration: number) {
  const phrases = frasesDaLegenda(text);
  if (phrases.length <= 1) return phrases[0] ?? text;
  const weights = phrases.map((phrase) => Math.max(1, phrase.split(/\s+/).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  for (let index = 0; index < phrases.length; index++) {
    cursor += (weights[index] / total) * duration;
    if (frame < cursor || index === phrases.length - 1) return phrases[index];
  }
  return phrases[phrases.length - 1];
}

const Panel: React.FC<{
  label: string;
  still: string;
  video: string;
  active: boolean;
  videoFrom: number;
  pauseFrame: number;
}> = ({ label, still, video, active, videoFrom, pauseFrame }) => (
  <div style={{
    width: "100%", aspectRatio: "1", position: "relative", overflow: "hidden",
    border: "4px solid #202020", borderRadius: 18, background: "#f0f0f0",
    boxShadow: "0 5px 0 #202020",
  }}>
    {video ? (
      active ? (
        <OffthreadVideo src={staticFile(video)} startFrom={videoFrom} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Freeze frame={pauseFrame}>
          <OffthreadVideo src={staticFile(video)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Freeze>
      )
    ) : still ? (
      <Img src={staticFile(still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 22, fontWeight: 800 }}>ADICIONE A IMAGEM</div>
    )}
    <div style={{
      position: "absolute", left: 10, right: 10, bottom: 10, padding: "8px 10px",
      borderRadius: 10, background: "rgba(20,20,20,.88)", color: "#fff",
      textAlign: "center", fontSize: 25, fontWeight: 800, letterSpacing: .3,
    }}>{label}</div>
    {!active && <div style={{
      position: "absolute", top: 10, right: 10, padding: "5px 9px",
      borderRadius: 8, color: "#fff", background: "rgba(20,20,20,.78)",
      fontSize: 15, fontWeight: 800,
    }}>PAUSADO</div>}
  </div>
);

const MascotStage: React.FC<{
  active: ComparisonSide;
  expression: ComparisonExpression;
  frame: number;
}> = ({ active, expression, frame }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const mascot = expression === "doubt"
    ? "comparacoes/personagens/duvida.png"
    : active === "left"
      ? "comparacoes/personagens/esquerda.png"
      : active === "right"
        ? "comparacoes/personagens/direita.png"
        : "comparacoes/personagens/duvida.png";

  return (
    <div style={{
      width: 300, height: 300, display: "flex", justifyContent: "center",
      alignItems: "center", position: "relative",
      transform: "scale(" + interpolate(pop, [0, 1], [.92, 1]) + ")",
    }}>
      <Img src={staticFile(mascot)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      {expression === "doubt" && (
        <div style={{
          position: "absolute", top: -20, right: -30, color: ACCENT,
          fontSize: 58, fontWeight: 1000, letterSpacing: 2,
          WebkitTextStroke: "2px #171717",
          textShadow: "3px 3px 0 #171717", whiteSpace: "nowrap",
        }}>???</div>
      )}
    </div>
  );
};

const Scene: React.FC<{
  props: ComparisonProps;
  segment: ComparisonSegment;
}> = ({ props, segment }) => {
  const frame = useCurrentFrame();
  const [leftActive, rightActive] = [segment.active === "left", segment.active === "right"];
  const leftVideoFrom = segment.leftVideoFrom ?? 0;
  const rightVideoFrom = segment.rightVideoFrom ?? 0;
  const caption = legendaNaFrame(segment.speech, frame, segment.durationInFrames);

  return (
    <AbsoluteFill style={{
      background: "#ffffff",
      color: INK,
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        position: "absolute", top: 82, left: 50, right: 50, textAlign: "center",
        fontSize: 44, fontWeight: 900, letterSpacing: .3, color: INK,
      }}>{props.title}</div>
      <div style={{
        position: "absolute", top: 290, left: 34, right: 34,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22,
      }}>
        <Panel label={props.leftLabel} still={segment.leftStill} video={props.leftVideo} active={leftActive} videoFrom={leftVideoFrom} pauseFrame={segment.leftPauseFrame ?? 0} />
        <Panel label={props.rightLabel} still={segment.rightStill} video={props.rightVideo} active={rightActive} videoFrom={rightVideoFrom} pauseFrame={segment.rightPauseFrame ?? 0} />
      </div>
      <div style={{
        position: "absolute", top: 820, left: 0, right: 0,
        display: "flex", justifyContent: "center",
      }}>
        <MascotStage active={segment.active} expression={segment.expression ?? "neutral"} frame={frame} />
      </div>
      {segment.audio && <Audio src={staticFile(segment.audio)} playbackRate={CAPTION_SPEED} />}
      <div style={{
        position: "absolute", left: 70, right: 70, bottom: 115,
        minHeight: 104, padding: "20px 28px", borderRadius: 16,
        background: "#ffffff", border: "3px solid #202020",
        color: INK, fontSize: 39, fontWeight: 850, lineHeight: 1.18,
        textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 5px 0 #202020",
      }}>{caption}</div>
    </AbsoluteFill>
  );
};

export const ComparisonVideo: React.FC<ComparisonProps> = (props) => {
  let from = 0;
  return (
    <AbsoluteFill>
      {props.segments.map((segment, index) => {
        const start = from;
        from += segment.durationInFrames;
        return (
          <Sequence key={index} from={start} durationInFrames={segment.durationInFrames}>
            <Scene props={props} segment={segment} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const comparisonDuration = (props: ComparisonProps) =>
  Math.max(1, props.segments.reduce((sum, segment) => sum + segment.durationInFrames, 0));

export const comparisonDefaults: ComparisonProps = {
  title: "MANGEKYOU VS. ETERNAL MANGEKYOU",
  leftLabel: "MANGEKYOU",
  rightLabel: "ETERNAL MANGEKYOU",
  leftVideo: "",
  rightVideo: "",
  segments: [
    {
      durationInFrames: 150,
      active: "left",
      speech: "Esse é o Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "",
      rightStill: "",
      leftVideoFrom: 0,
      rightPauseFrame: 0,
    },
    {
      durationInFrames: 150,
      active: "right",
      speech: "E esse é o Eternal Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "",
      rightStill: "",
      rightVideoFrom: 0,
      leftPauseFrame: 150,
    },
    {
      durationInFrames: 105,
      active: "none",
      speech: "Mas afinal, qual é a diferença?",
      expression: "doubt",
      leftPauseFrame: 150,
      rightPauseFrame: 150,
      leftStill: "",
      rightStill: "",
    },
  ],
};
