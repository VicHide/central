import React from "react";
import {
  AbsoluteFill,
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
  leftStill: string;
  rightStill: string;
  leftVideoFrom?: number;
  rightVideoFrom?: number;
};

export type ComparisonProps = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftVideo: string;
  rightVideo: string;
  segments: ComparisonSegment[];
};

const INK = "#171321";
const PAPER = "#fff8e7";
const YELLOW = "#ffd43b";

const Panel: React.FC<{
  label: string;
  still: string;
  video: string;
  active: boolean;
  videoFrom: number;
}> = ({ label, still, video, active, videoFrom }) => {
  return (
    <div style={{
      width: "100%", aspectRatio: "1", position: "relative", overflow: "hidden",
      border: "5px solid " + PAPER, borderRadius: 22, background: "#282333",
      boxShadow: "0 8px 0 " + INK,
    }}>
      {active && video ? (
        <OffthreadVideo
          src={staticFile(video)}
          startFrom={videoFrom}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : still ? (
        <Img src={staticFile(still)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: PAPER, fontSize: 22, fontWeight: 800 }}>ADICIONE A IMAGEM</div>
      )}
      <div style={{
        position: "absolute", left: 10, right: 10, bottom: 10, padding: "8px 10px",
        borderRadius: 10, background: "rgba(15,12,22,.82)", color: PAPER,
        textAlign: "center", fontSize: 25, fontWeight: 800, letterSpacing: .5,
      }}>{label}</div>
      {!active && <div style={{
        position: "absolute", top: 10, right: 10, padding: "5px 9px",
        borderRadius: 8, color: PAPER, background: "rgba(15,12,22,.78)",
        fontSize: 15, fontWeight: 800,
      }}>PAUSADO</div>}
    </div>
  );
};

const MascotStage: React.FC<{ active: ComparisonSide; expression: ComparisonExpression; frame: number }> = ({ active, expression, frame }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  // Reserved transparent stage for the original mascot asset, to be integrated later.
  return (
    <div style={{
      width: 180, minHeight: 220, display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center", position: "relative",
      transform: "scale(" + interpolate(pop, [0, 1], [.92, 1]) + ")",
    }}>
      {expression === "doubt" && (
        <div style={{
          position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
          color: YELLOW, fontSize: 48, fontWeight: 1000, letterSpacing: 2,
          textShadow: "3px 3px 0 " + INK, whiteSpace: "nowrap",
        }}>???</div>
      )}
      <div style={{
        width: 104, height: 104, borderRadius: "50%", background: "#51476a",
        border: "5px dashed " + PAPER, display: "flex", alignItems: "center",
        justifyContent: "center", color: PAPER, fontSize: 14, fontWeight: 800,
      }}>PERSONAGEM</div>
      <div style={{ color: YELLOW, fontSize: 50, fontWeight: 900, lineHeight: 1 }}>{arrow}</div>
      {expression === "doubt" && <div style={{ color: PAPER, fontSize: 22, fontWeight: 800 }}>DÚVIDA</div>}
    </div>
  );
};

const Scene: React.FC<{
  props: ComparisonProps;
  segment: ComparisonSegment;
}> = ({ props, segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [leftActive, rightActive] = [segment.active === "left", segment.active === "right"];
  const videoFrom = leftActive ? (segment.leftVideoFrom ?? 0) : (segment.rightVideoFrom ?? 0);
  return (
    <AbsoluteFill style={{
      background: "radial-gradient(circle at 50% 38%, #49366f 0%, #211a31 72%)",
      color: PAPER, fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        position: "absolute", top: 90, left: 50, right: 50, textAlign: "center",
        fontSize: 44, fontWeight: 900, letterSpacing: 1,
      }}>{props.title}</div>
      <div style={{
        position: "absolute", top: 330, left: 34, right: 34,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22,
      }}>
        <Panel label={props.leftLabel} still={segment.leftStill} video={props.leftVideo} active={leftActive} videoFrom={videoFrom} />
        <Panel label={props.rightLabel} still={segment.rightStill} video={props.rightVideo} active={rightActive} videoFrom={videoFrom} />
      </div>
      <div style={{
        position: "absolute", top: 790, left: 0, right: 0,
        display: "flex", justifyContent: "center",
      }}>
        <MascotStage active={segment.active} expression={segment.expression ?? "neutral"} frame={frame} />
      </div>
      <div style={{
        position: "absolute", left: 55, right: 55, bottom: 180,
        padding: "24px 28px", borderRadius: 20,
        background: "rgba(13,10,20,.88)", border: "3px solid " + PAPER,
        color: PAPER, fontSize: 37, fontWeight: 800, lineHeight: 1.2,
        textAlign: "center",
      }}>{segment.speech}</div>
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
  leftVideo: "comparacao/mangekyou-a.mp4",
  rightVideo: "comparacao/mangekyou-b.mp4",
  segments: [
    {
      durationInFrames: 150,
      active: "left",
      speech: "Esse é o Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "",
      rightStill: "",
      leftVideoFrom: 0,
    },
    {
      durationInFrames: 150,
      active: "right",
      speech: "E esse é o Eternal Mangekyou Sharingan.",
      expression: "neutral",
      leftStill: "comparacao/mangekyou-a-pause.jpg",
      rightStill: "comparacao/mangekyou-b-pause.jpg",
      rightVideoFrom: 0,
    },
    {
      durationInFrames: 105,
      active: "none",
      speech: "Mas afinal, qual é a diferença?",
      expression: "doubt",
      leftStill: "comparacao/mangekyou-a-pause.jpg",
      rightStill: "comparacao/mangekyou-b-pause.jpg",
    },
  ],
};
