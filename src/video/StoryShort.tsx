import React from "react";
import {
  AbsoluteFill,
  Audio,
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
import { Musica, MusicaProps } from "./Sons";

const { fontFamily: MONTSERRAT } = loadFont("normal", {
  weights: ["800", "900"],
  subsets: ["latin"],
});

export type StoryMotion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right";

export type StoryWordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

export type StorySegment = {
  durationInFrames: number;
  media: string;
  mediaType: "image" | "video";
  motion?: StoryMotion;
  speech: string;
  hookTop?: string;
  hookBottom?: string;
  audio?: string;
  audioRate?: number;
  words?: StoryWordTiming[];
};

export type StoryShortProps = {
  title: string;
  segments: StorySegment[];
  musica?: MusicaProps;
};

type TimedWord = {
  text: string;
  startFrame: number;
  endFrame: number;
};

const MOTIONS: StoryMotion[] = ["zoom-in", "pan-left", "zoom-out", "pan-right"];

function buildTimedWords(
  speech: string,
  durationInFrames: number,
  fps: number,
  rawWords?: StoryWordTiming[],
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
  const activeFrames = Math.max(1, durationInFrames - 2);
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

function groupWords(words: TimedWord[], maxWords = 3, maxChars = 20): TimedWord[][] {
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

const MediaBackdrop: React.FC<{
  media: string;
  mediaType: "image" | "video";
  motion: StoryMotion;
  durationInFrames: number;
}> = ({ media, mediaType, motion, durationInFrames }) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 1)));

  let scale = 1.08;
  let tx = 0;
  if (motion === "zoom-in") {
    scale = interpolate(progress, [0, 1], [1.02, 1.24]);
  } else if (motion === "zoom-out") {
    scale = interpolate(progress, [0, 1], [1.24, 1.02]);
  } else if (motion === "pan-left") {
    scale = 1.22;
    tx = interpolate(progress, [0, 1], [74, -74]);
  } else if (motion === "pan-right") {
    scale = 1.22;
    tx = interpolate(progress, [0, 1], [-74, 74]);
  }
  const cutPunch = interpolate(frame, [0, 5], [1.06, 1], { extrapolateRight: "clamp" });
  const cutFlash = interpolate(frame, [0, 5], [1.18, 1], { extrapolateRight: "clamp" });

  if (!media) {
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(160deg, #161822 0%, #0b0c10 100%)",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
          fontSize: 32,
          fontWeight: 800,
        }}
      >
        ADICIONE UMA IMAGEM OU VÍDEO
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `translate3d(${tx}px, 0, 0) scale(${scale * cutPunch})`,
          transformOrigin: "center center",
          filter: `brightness(${cutFlash})`,
        }}
      >
        {mediaType === "video" ? (
          <OffthreadVideo
            src={staticFile(media)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Img
            src={staticFile(media)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at center, rgba(0,0,0,0.08) 35%, rgba(0,0,0,0.45) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const CenterCaption: React.FC<{
  speech: string;
  durationInFrames: number;
  words?: StoryWordTiming[];
  hookTop?: string;
  hookBottom?: string;
}> = ({ speech, durationInFrames, words, hookTop, hookBottom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const timedWords = React.useMemo(
    () => buildTimedWords(speech, durationInFrames, fps, words),
    [speech, durationInFrames, fps, words],
  );
  const chunks = React.useMemo(() => groupWords(timedWords), [timedWords]);

  if (hookTop || hookBottom) {
    const pop = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 48px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            textAlign: "center",
            transform: `scale(${interpolate(pop, [0, 1], [0.88, 1])})`,
            textTransform: "uppercase",
            lineHeight: 1.06,
          }}
        >
          {hookTop && (
            <div
              style={{
                fontSize: 82,
                fontWeight: 900,
                color: "#ff9900",
                paintOrder: "stroke fill",
                WebkitTextStroke: "14px #000000",
                textShadow: "0 6px 14px rgba(0,0,0,0.65)",
              }}
            >
              {hookTop}
            </div>
          )}
          {hookBottom && (
            <div
              style={{
                fontSize: 82,
                fontWeight: 900,
                color: "#ffffff",
                paintOrder: "stroke fill",
                WebkitTextStroke: "14px #000000",
                textShadow: "0 6px 14px rgba(0,0,0,0.65)",
              }}
            >
              {hookBottom}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  if (chunks.length === 0) return null;

  let activeChunkIndex = chunks.length - 1;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const start = chunk[0].startFrame;
    const end = chunk[chunk.length - 1].endFrame;
    if (frame < end || i === chunks.length - 1) {
      activeChunkIndex = i;
      break;
    }
    if (frame < start) {
      activeChunkIndex = i;
      break;
    }
  }

  const activeChunk = chunks[activeChunkIndex];
  const chunkAge = Math.max(0, frame - activeChunk[0].startFrame);
  const pop = spring({ frame: chunkAge, fps, config: { damping: 12, stiffness: 320 } });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: "0 52px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "10px 18px",
          textAlign: "center",
          textTransform: "uppercase",
          fontStyle: "italic",
          transform: `scale(${interpolate(pop, [0, 1], [0.86, 1])}) rotate(-1deg)`,
        }}
      >
        {activeChunk.map((word, index) => {
          const isSpoken = frame >= word.startFrame && frame < word.endFrame;
          return (
            <span
              key={`${activeChunkIndex}-${index}-${word.text}`}
              style={{
                display: "inline-block",
                fontSize: 68,
                fontWeight: 900,
                lineHeight: 1.06,
                letterSpacing: 0.8,
                color: isSpoken ? "#ffe033" : "#ffffff",
                transform: isSpoken ? "scale(1.1)" : "scale(1)",
                paintOrder: "stroke fill",
                WebkitTextStroke: "15px #000000",
                textShadow: "0 6px 0 #000000, 0 12px 20px rgba(0, 0, 0, 0.78)",
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const StoryScene: React.FC<{
  segment: StorySegment;
  index: number;
}> = ({ segment, index }) => {
  const motion = segment.motion ?? MOTIONS[index % MOTIONS.length];

  return (
    <AbsoluteFill style={{ fontFamily: MONTSERRAT }}>
      <MediaBackdrop
        media={segment.media}
        mediaType={segment.mediaType}
        motion={motion}
        durationInFrames={segment.durationInFrames}
      />
      <CenterCaption
        speech={segment.speech}
        durationInFrames={segment.durationInFrames}
        words={segment.words}
        hookTop={segment.hookTop}
        hookBottom={segment.hookBottom}
      />
      {segment.audio && (
        <Audio src={staticFile(segment.audio)} playbackRate={segment.audioRate ?? 1} />
      )}
    </AbsoluteFill>
  );
};

export const storyDuration = (props: StoryShortProps) =>
  Math.max(1, props.segments.reduce((sum, segment) => sum + segment.durationInFrames, 0));

export const StoryShort: React.FC<StoryShortProps> = (props) => {
  let from = 0;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {props.musica?.arquivo && <Musica musica={props.musica} />}
      {props.segments.map((segment, index) => {
        const start = from;
        from += segment.durationInFrames;
        return (
          <Sequence key={index} from={start} durationInFrames={segment.durationInFrames}>
            <StoryScene segment={segment} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const storyDefaults: StoryShortProps = {
  title: "NUNCA VAI SER CAPITÃO",
  segments: [
    {
      durationInFrames: 90,
      media: "",
      mediaType: "image",
      motion: "zoom-in",
      speech: "Por que Kira nunca vai se tornar capitão em Bleach?",
      hookTop: "NUNCA VAI",
      hookBottom: "SER CAPITÃO",
    },
    {
      durationInFrames: 105,
      media: "",
      mediaType: "image",
      motion: "pan-left",
      speech: "Mesmo sendo um dos tenentes mais fortes, ele carrega o trauma da traição.",
    },
  ],
};
