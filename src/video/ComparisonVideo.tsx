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
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily: MONTSERRAT } = loadFont("normal", {
  weights: ["800", "900"],
  subsets: ["latin"],
});

export type ComparisonSide = "left" | "right" | "none";
export type ComparisonExpression = "neutral" | "doubt" | "surprise";

export type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type ComparisonSegment = {
  durationInFrames: number;
  active: ComparisonSide;
  speech: string;
  expression?: ComparisonExpression;
  audio?: string;
  audioRate?: number;
  words?: WordTiming[];
  leftLabel?: string;
  rightLabel?: string;
  leftStill: string;
  rightStill: string;
  leftVideo?: string;
  rightVideo?: string;
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

const HIGHLIGHT = "#ffe600";
const STROKE_STYLE: React.CSSProperties = {
  paintOrder: "stroke fill",
  WebkitTextStroke: "10px #000000",
  textShadow: "0 4px 8px rgba(0, 0, 0, 0.35)",
};

type TimedWord = {
  text: string;
  startFrame: number;
  endFrame: number;
};

function buildTimedWords(
  speech: string,
  durationInFrames: number,
  fps: number,
  rawWords?: WordTiming[],
): TimedWord[] {
  if (rawWords && rawWords.length > 0) {
    return rawWords.map((w) => ({
      text: w.text,
      startFrame: Math.max(0, Math.round((w.startMs / 1000) * fps)),
      endFrame: Math.max(1, Math.round((w.endMs / 1000) * fps)),
    }));
  }

  const tokens = speech.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const activeFrames = Math.max(1, durationInFrames - 4);
  const weights = tokens.map((t) => Math.max(2, t.replace(/[^\p{L}\p{N}]/gu, "").length));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let cursor = 0;
  return tokens.map((text, index) => {
    const span = (weights[index] / totalWeight) * activeFrames;
    const startFrame = Math.floor(cursor);
    cursor += span;
    const endFrame = index === tokens.length - 1 ? durationInFrames : Math.max(startFrame + 1, Math.floor(cursor));
    return { text, startFrame, endFrame };
  });
}

function groupWordsIntoChunks(words: TimedWord[], maxWords = 3, maxChars = 22): TimedWord[][] {
  const chunks: TimedWord[][] = [];
  let current: TimedWord[] = [];
  let currentChars = 0;

  for (const word of words) {
    const nextChars = currentChars + (current.length > 0 ? 1 : 0) + word.text.length;
    const endsSentence = current.length > 0 && /[.!?]$/.test(current[current.length - 1].text);
    if (current.length >= maxWords || (current.length > 0 && nextChars > maxChars) || endsSentence) {
      chunks.push(current);
      current = [word];
      currentChars = word.text.length;
    } else {
      current.push(word);
      currentChars = nextChars;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const Panel: React.FC<{
  label: string;
  still: string;
  video: string;
  active: boolean;
  videoFrom: number;
  pauseFrame: number;
}> = ({ label, still, video, active, videoFrom, pauseFrame }) => (
  <div
    style={{
      width: "100%",
      aspectRatio: "1",
      position: "relative",
      overflow: "hidden",
      background: "#f2f2f2",
    }}
  >
    {video ? (
      active ? (
        <OffthreadVideo
          src={staticFile(video)}
          startFrom={videoFrom}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Freeze frame={pauseFrame}>
          <OffthreadVideo
            src={staticFile(video)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Freeze>
      )
    ) : still ? (
      <Img src={staticFile(still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontSize: 24,
          fontWeight: 800,
        }}
      >
        SEM MÍDIA
      </div>
    )}
    {label && (
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 16,
          textAlign: "center",
          color: "#ffffff",
          fontSize: 40,
          fontWeight: 900,
          lineHeight: 1.08,
          letterSpacing: 0.2,
          paintOrder: "stroke fill",
          WebkitTextStroke: "8px #000000",
          textShadow: "0 3px 6px rgba(0, 0, 0, 0.45)",
        }}
      >
        {label}
      </div>
    )}
  </div>
);

const MascotStage: React.FC<{
  active: ComparisonSide;
  expression: ComparisonExpression;
  frame: number;
}> = ({ active, expression, frame }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  const mascot =
    expression === "doubt" || active === "none"
      ? "comparacoes/personagens/duvida.png"
      : active === "left"
        ? "comparacoes/personagens/esquerda.png"
        : "comparacoes/personagens/direita.png";

  return (
    <div
      style={{
        width: 780,
        height: 920,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        transform: `scale(${interpolate(pop, [0, 1], [0.96, 1])})`,
      }}
    >
      <Img
        src={staticFile(mascot)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
};

const CaptionLine: React.FC<{
  speech: string;
  durationInFrames: number;
  words?: WordTiming[];
}> = ({ speech, durationInFrames, words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timedWords = React.useMemo(
    () => buildTimedWords(speech, durationInFrames, fps, words),
    [speech, durationInFrames, fps, words],
  );
  const chunks = React.useMemo(() => groupWordsIntoChunks(timedWords), [timedWords]);

  if (chunks.length === 0) return null;

  let activeChunk = chunks[chunks.length - 1];
  for (const chunk of chunks) {
    const chunkStart = chunk[0].startFrame;
    const chunkEnd = chunk[chunk.length - 1].endFrame;
    if (frame >= chunkStart && frame < chunkEnd) {
      activeChunk = chunk;
      break;
    }
    if (frame < chunkStart) {
      activeChunk = chunk;
      break;
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 790,
        left: 44,
        right: 44,
        minHeight: 88,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "8px 14px",
        textAlign: "center",
      }}
    >
      {activeChunk.map((word, index) => {
        const isSpoken = frame >= word.startFrame && frame < word.endFrame;
        return (
          <span
            key={`${word.text}-${index}`}
            style={{
              fontSize: 54,
              fontWeight: 900,
              lineHeight: 1.12,
              color: isSpoken ? HIGHLIGHT : "#ffffff",
              ...STROKE_STYLE,
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

const Scene: React.FC<{
  props: ComparisonProps;
  segment: ComparisonSegment;
}> = ({ props, segment }) => {
  const frame = useCurrentFrame();
  const leftActive = segment.active === "left";
  const rightActive = segment.active === "right";
  const leftLabel = segment.leftLabel ?? props.leftLabel;
  const rightLabel = segment.rightLabel ?? props.rightLabel;
  const leftVideo = segment.leftVideo ?? props.leftVideo;
  const rightVideo = segment.rightVideo ?? props.rightVideo;

  return (
    <AbsoluteFill
      style={{
        background: "#ffffff",
        fontFamily: MONTSERRAT,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 220,
          left: 0,
          right: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          background: "#ffffff",
        }}
      >
        <Panel
          label={leftLabel}
          still={segment.leftStill}
          video={leftVideo}
          active={leftActive}
          videoFrom={segment.leftVideoFrom ?? 0}
          pauseFrame={segment.leftPauseFrame ?? 0}
        />
        <Panel
          label={rightLabel}
          still={segment.rightStill}
          video={rightVideo}
          active={rightActive}
          videoFrom={segment.rightVideoFrom ?? 0}
          pauseFrame={segment.rightPauseFrame ?? 0}
        />
      </div>

      <CaptionLine
        speech={segment.speech}
        durationInFrames={segment.durationInFrames}
        words={segment.words}
      />

      <div
        style={{
          position: "absolute",
          top: 905,
          bottom: 35,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <MascotStage
          active={segment.active}
          expression={segment.expression ?? "neutral"}
          frame={frame}
        />
      </div>

      {segment.audio && <Audio src={staticFile(segment.audio)} playbackRate={segment.audioRate ?? 1} />}
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
  leftLabel: "Mangekyo",
  rightLabel: "Eternal Mangekyo",
  leftVideo: "",
  rightVideo: "",
  segments: [
    {
      durationInFrames: 120,
      active: "left",
      speech: "Esse aqui é o Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "",
      rightStill: "",
      leftVideoFrom: 0,
      rightPauseFrame: 0,
    },
    {
      durationInFrames: 120,
      active: "right",
      speech: "E esse é o Eternal Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "",
      rightStill: "",
      rightVideoFrom: 0,
      leftPauseFrame: 120,
    },
    {
      durationInFrames: 105,
      active: "none",
      speech: "Mas afinal, qual é a diferença?",
      expression: "doubt",
      leftPauseFrame: 120,
      rightPauseFrame: 120,
      leftStill: "",
      rightStill: "",
    },
  ],
};
