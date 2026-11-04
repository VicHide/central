import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Intro, IntroProps, INTRO_FRAMES } from "./Intro";
import { Quiz, QuizProps } from "./Quiz";
import { QuizZoom, ZoomProps } from "./QuizZoom";

export type ZoomCompletoProps = { intro: IntroProps; zoom: ZoomProps };
export type QuizCompletoProps = { intro: IntroProps; quiz: QuizProps };

export const ZoomCompleto: React.FC<ZoomCompletoProps> = ({ intro, zoom }) => (
  <AbsoluteFill>
    <Sequence durationInFrames={INTRO_FRAMES}><Intro {...intro} /></Sequence>
    <Sequence from={INTRO_FRAMES}><QuizZoom {...zoom} /></Sequence>
  </AbsoluteFill>
);

export const QuizCompleto: React.FC<QuizCompletoProps> = ({ intro, quiz }) => (
  <AbsoluteFill>
    <Sequence durationInFrames={INTRO_FRAMES}><Intro {...intro} /></Sequence>
    <Sequence from={INTRO_FRAMES}><Quiz {...quiz} /></Sequence>
  </AbsoluteFill>
);
