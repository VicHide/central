import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Bangers";
import { Efeito, Tics, Musica, MusicaProps } from "./Sons";
import { Revelacao } from "./Revelacao";

const { fontFamily } = loadFont();

export const FPS = 30;

export type Pergunta = {
  numero: number;
  anime: string;
  imagens: (string | null)[]; // 4 caminhos dentro de /public, ou null para placeholder
  capa?: string | null; // cartão de capa na revelação (opcional; o gerar baixa do AniList)
  nota?: number | null; // 0 a 10, do AniList (opcional)
  generos?: string[]; // até 2, em português (opcional)
  ano?: number | null;
  formato?: string | null; // TV, MOVIE, OVA, ONA...
  estudio?: string | null;
};

export type QuizProps = {
  perguntas: Pergunta[];
  segPorDica: number;
  segRevelacao: number;
  canal: string;
  musica?: MusicaProps;
};

// Níveis: a dica 1 é a mais difícil e vale mais pontos.
const NIVEIS = [
  { nome: "DIFÍCIL", pontos: 4, cor: "#ff5d73" },
  { nome: "MÉDIO", pontos: 3, cor: "#ffb703" },
  { nome: "FÁCIL", pontos: 2, cor: "#4cc9f0" },
  { nome: "SUPERFÁCIL", pontos: 1, cor: "#7ae582" },
];

export const INK = "#1b1033";
export const PAPEL = "#fff8e7";

const duracaoPergunta = (p: QuizProps) =>
  Math.round((4 * p.segPorDica + p.segRevelacao) * FPS);

export const duracaoTotal = (p: QuizProps) =>
  Math.max(1, p.perguntas.length * duracaoPergunta(p));

export const contorno = (s: number): React.CSSProperties => ({
  fontFamily,
  color: PAPEL,
  WebkitTextStroke: `${10 * s}px ${INK}`,
  paintOrder: "stroke fill",
  letterSpacing: 2 * s,
  lineHeight: 1,
});

const Imagem: React.FC<{ src: string | null; indice: number; s: number }> = ({
  src,
  indice,
  s,
}) =>
  src ? (
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `repeating-linear-gradient(45deg, #5a3ea8 0 ${24 * s}px, #6b4bc4 ${24 * s}px ${48 * s}px)`,
        ...contorno(s),
        fontSize: 64 * s,
      }}
    >
      IMAGEM {indice + 1}
    </div>
  );

const Cena: React.FC<{ p: Pergunta; total: number; props: QuizProps }> = ({ p, total, props }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = Math.min(width, height) / 1080;
  const dica = props.segPorDica * fps;
  const barra = interpolate(frame, [0, 4 * dica], [0, 100], { extrapolateRight: "clamp" });
  const revelando = frame >= 4 * dica;

  const caixa: React.CSSProperties = {
    border: `${8 * s}px solid ${PAPEL}`,
    borderRadius: 28 * s,
    boxShadow: `0 ${10 * s}px 0 ${INK}`,
    overflow: "hidden",
    position: "relative",
  };

  return (
    <AbsoluteFill
      style={{
        background: `repeating-conic-gradient(from ${frame * 0.25}deg at 50% 45%, #3a1d7a 0deg 9deg, #4a2a94 9deg 18deg)`,
      }}
    >
      {/* Topo: contador, barra de tempo, espaço do mascote */}
      <div style={{ position: "absolute", top: 36 * s, left: 48 * s, right: 48 * s, height: 96 * s, display: "flex", alignItems: "center", gap: 28 * s }}>
        <div style={{ width: 96 * s, height: 96 * s, borderRadius: "50%", background: "#ff5d73", border: `${8 * s}px solid ${PAPEL}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46 * s, ...contorno(s * 0.6) }}>
          {p.numero}
        </div>
        <div style={{ flex: 1, height: 52 * s, background: PAPEL, borderRadius: 30 * s, padding: 7 * s, boxShadow: `0 ${6 * s}px 0 ${INK}` }}>
          <div style={{ width: `${barra}%`, height: "100%", borderRadius: 24 * s, background: `repeating-linear-gradient(-45deg, #7ae582 0 ${16 * s}px, #4fc65a ${16 * s}px ${32 * s}px)` }} />
        </div>
        <div style={{ width: 96 * s, height: 96 * s, borderRadius: "50%", background: PAPEL, border: `${6 * s}px dashed ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily, fontSize: 20 * s, color: INK }}>
          SEU MASCOTE
        </div>
      </div>

      {/* Grade 2x2 */}
      <div style={{ position: "absolute", top: 170 * s, left: 48 * s, right: 48 * s, bottom: 110 * s, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 32 * s }}>
        {NIVEIS.map((n, i) => {
          const inicio = i * dica;
          const aberta = frame >= inicio;
          const pop = spring({ frame: frame - inicio, fps, config: { damping: 11, stiffness: 140 } });
          const escala = aberta ? interpolate(pop, [0, 1], [0.82, 1]) : 1;
          return (
            <div key={i} style={{ ...caixa, transform: `scale(${escala})`, background: n.cor }}>
              {aberta ? (
                <>
                  <Imagem src={p.imagens[i] ?? null} indice={i} s={s} />
                  <div style={{ position: "absolute", top: 12 * s, left: 12 * s, width: 64 * s, height: 64 * s, borderRadius: "50%", background: n.cor, border: `${6 * s}px solid ${PAPEL}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 * s, ...contorno(s * 0.5) }}>
                    {i + 1}
                  </div>
                </>
              ) : (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 * s }}>
                  <div style={{ ...contorno(s), fontSize: 110 * s }}>{n.nome}</div>
                  <div style={{ ...contorno(s * 0.7), fontSize: 56 * s }}>+{n.pontos} PONTOS</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé: nome do canal e progresso das perguntas */}
      <div style={{ position: "absolute", left: 48 * s, right: 48 * s, bottom: 28 * s, display: "flex", justifyContent: "space-between", alignItems: "center", ...contorno(s * 0.5), fontSize: 44 * s }}>
        <span>{props.canal}</span>
        <span>{p.numero}/{total}</span>
      </div>

      {/* Revelação da resposta */}
      {revelando && <Revelacao p={p} frame={frame - 4 * dica} canal={props.canal} />}

      {/* Áudio: entrada, dicas, tic-tac no fim e revelação */}
      <Efeito src="sfx/whoosh.wav" de={0} volume={0.35} />
      {[1, 2, 3].map((i) => <Efeito key={i} src="sfx/pop.wav" de={i * dica} volume={0.5} />)}
      <Tics fimFrame={4 * dica} />
      <Efeito src="sfx/reveal.wav" de={4 * dica} volume={0.6} />
    </AbsoluteFill>
  );
};

export const Resposta: React.FC<{ nome: string; frame: number; s: number }> = ({ nome, frame, s }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ background: `rgba(27,16,51,${0.72 * Math.min(1, frame / 8)})`, alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.3, 1])}) rotate(-3deg)`, background: "#ffb703", border: `${10 * s}px solid ${PAPEL}`, borderRadius: 36 * s, boxShadow: `0 ${14 * s}px 0 ${INK}`, padding: `${36 * s}px ${64 * s}px`, textAlign: "center", maxWidth: "86%" }}>
        <div style={{ ...contorno(s * 0.6), fontSize: 52 * s, marginBottom: 14 * s }}>ERA...</div>
        <div style={{ ...contorno(s), fontSize: 120 * s }}>{nome}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Quiz: React.FC<QuizProps> = (props) => {
  const d = duracaoPergunta(props);
  return (
    <AbsoluteFill>
      <Musica musica={props.musica} />
      {props.perguntas.map((p, i) => (
        <Sequence key={p.numero} from={i * d} durationInFrames={d}>
          <Cena p={p} total={props.perguntas.length} props={props} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
