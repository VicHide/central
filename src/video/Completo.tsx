import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Intro, IntroProps, INTRO_FRAMES } from "./Intro";
import { Quiz, QuizProps } from "./Quiz";
import { QuizZoom, ZoomProps } from "./QuizZoom";
import { Efeito, Musica, MusicaProps } from "./Sons";

export type ZoomCompletoProps = { intro: IntroProps; zoom: ZoomProps; musica?: MusicaProps };
export type QuizCompletoProps = { intro: IntroProps; quiz: QuizProps; musica?: MusicaProps };

export const ZoomCompleto: React.FC<ZoomCompletoProps> = ({ intro, zoom, musica }) => (
  <AbsoluteFill>
    <Musica musica={musica} />
    <Efeito src="sfx/whoosh.wav" de={0} volume={0.4} />
    <Sequence durationInFrames={INTRO_FRAMES}><Intro {...intro} /></Sequence>
    <Sequence from={INTRO_FRAMES}><QuizZoom {...zoom} /></Sequence>
  </AbsoluteFill>
);

export const QuizCompleto: React.FC<QuizCompletoProps> = ({ intro, quiz, musica }) => (
  <AbsoluteFill>
    <Musica musica={musica} />
    <Efeito src="sfx/whoosh.wav" de={0} volume={0.4} />
    <Sequence durationInFrames={INTRO_FRAMES}><Intro {...intro} /></Sequence>
    <Sequence from={INTRO_FRAMES}><Quiz {...quiz} /></Sequence>
  </AbsoluteFill>
);
