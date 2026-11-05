import React from "react";
import { Composition } from "remotion";
import { Quiz, QuizProps, duracaoTotal, FPS } from "./Quiz";
import { QuizZoom, ZoomProps, duracaoZoom } from "./QuizZoom";
import { SEG_POR_CORTE, SEG_REVELACAO } from "../config";
import { Intro, IntroProps, INTRO_FRAMES } from "./Intro";
import { ZoomCompleto, QuizCompleto, ZoomCompletoProps, QuizCompletoProps } from "./Completo";
import { TopShort, TopProps, duracaoTop } from "./TopShort";
import { MusicaProps } from "./Sons";
import dados from "../../data/perguntas.json";
import dadosZoom from "../../data/zoom.json";
import dadosIntro from "../../data/intro.json";
import dadosTop from "../../data/top.json";
import dadosMusica from "../../data/musica-atual.json";

const musica = dadosMusica as MusicaProps; // escolhida pelo `gerar` / `top`
const intro = dadosIntro as IntroProps;

const base: QuizProps = {
  perguntas: dados as QuizProps["perguntas"],
  segPorDica: 3,
  segRevelacao: 3,
  canal: "SEU CANAL",
};

const zoom: ZoomProps = {
  perguntas: dadosZoom as ZoomProps["perguntas"],
  segPorCorte: SEG_POR_CORTE,
  segRevelacao: SEG_REVELACAO,
  canal: "SEU CANAL",
  transicao: "suave", // "corte" para cortes secos
};

export const Root: React.FC = () => (
  <>
    <Composition id="QuizLongo" component={Quiz} width={1920} height={1080} fps={FPS} durationInFrames={1}
      defaultProps={{ ...base, musica }} calculateMetadata={({ props }) => ({ durationInFrames: duracaoTotal(props) })} />
    <Composition id="QuizShort" component={Quiz} width={1080} height={1920} fps={FPS} durationInFrames={1}
      defaultProps={{ ...base, perguntas: base.perguntas.slice(0, 1), musica }} calculateMetadata={({ props }) => ({ durationInFrames: duracaoTotal(props) })} />
    <Composition id="ZoomLongo" component={QuizZoom} width={1920} height={1080} fps={FPS} durationInFrames={1}
      defaultProps={{ ...zoom, musica }} calculateMetadata={({ props }) => ({ durationInFrames: duracaoZoom(props) })} />
    <Composition id="ZoomShort" component={QuizZoom} width={1080} height={1920} fps={FPS} durationInFrames={1}
      defaultProps={{ ...zoom, perguntas: zoom.perguntas.slice(0, 1), musica }} calculateMetadata={({ props }) => ({ durationInFrames: duracaoZoom(props) })} />
    <Composition id="Intro" component={Intro} width={1920} height={1080} fps={FPS} durationInFrames={INTRO_FRAMES} defaultProps={intro} />
    <Composition id="ZoomCompleto" component={ZoomCompleto} width={1920} height={1080} fps={FPS} durationInFrames={1}
      defaultProps={{ intro, zoom, musica } as ZoomCompletoProps}
      calculateMetadata={({ props }) => ({ durationInFrames: INTRO_FRAMES + duracaoZoom(props.zoom) })} />
    <Composition id="QuizCompleto" component={QuizCompleto} width={1920} height={1080} fps={FPS} durationInFrames={1}
      defaultProps={{ intro, quiz: base, musica } as QuizCompletoProps}
      calculateMetadata={({ props }) => ({ durationInFrames: INTRO_FRAMES + duracaoTotal(props.quiz) })} />
    <Composition id="TopShort" component={TopShort} width={1080} height={1920} fps={FPS} durationInFrames={1}
      defaultProps={{ ...(dadosTop as TopProps), musica }} calculateMetadata={({ props }) => ({ durationInFrames: duracaoTop(props) })} />
  </>
);
