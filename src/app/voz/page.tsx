"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const TEXTO_TESTE = "Você acha que conhece esse personagem? Então espera até descobrir o que ele realmente é capaz de fazer. Em um mundo onde os mais fortes dominam tudo, existe alguém que está prestes a mudar completamente as regras do jogo!";

export default function VozPage() {
  const [text, setText] = useState(TEXTO_TESTE);
  const [voice, setVoice] = useState<"leo" | "fabio">("fabio");
  const [audioUrl, setAudioUrl] = useState("");
  const [contentType, setContentType] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const generate = async () => {
    setLoading(true);
    setMessage("");
    setAudioUrl("");
    setContentType("");

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.erro || "Não foi possível gerar o áudio.");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("O Speko retornou um áudio vazio.");

      setContentType(response.headers.get("content-type") || blob.type);
      setAudioUrl(URL.createObjectURL(blob));
      setMessage("Áudio gerado. Ouça e avalie a pronúncia e a interpretação.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao gerar o áudio.");
    } finally {
      setLoading(false);
    }
  };

  const extension = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3"
    : contentType.includes("wav") ? "wav"
      : contentType.includes("ogg") ? "ogg"
        : contentType.includes("mp4") ? "m4a"
          : contentType.includes("aac") ? "aac"
            : contentType.includes("flac") ? "flac"
              : contentType.includes("pcm") ? "pcm" : "bin";

  return (
    <main className="frames-workspace">
      <header className="frames-heading">
        <div>
          <Link className="frames-back" href="/">← Voltar à central</Link>
          <p className="frames-kicker">FERRAMENTAS DE ÁUDIO</p>
          <h1>Teste de voz · Leo & Fabio</h1>
          <p className="frames-lead">
            Compare a voz paga Leo (xAI via Speko) com a opção gratuita Fabio (Edge TTS ajustada para soar mais jovem e ágil).
          </p>
        </div>
        <span className="frames-status completed">{voice === "fabio" ? "Edge TTS · Grátis" : "xAI · Speko"}</span>
      </header>

      <section className="composer" style={{ maxWidth: 900 }}>
        <div className="section-head">
          <div>
            <h2>Texto da amostra</h2>
            <p>O mesmo texto pode ser reutilizado para comparar as vozes.</p>
          </div>
          <span className="step-label">{voice === "fabio" ? "Fabio · tom jovem" : "Leo · português"}</span>
        </div>

        <div className="form-body" style={{ marginTop: 20 }}>
          <div className="fields" style={{ marginBottom: 14 }}>
            <label>Voz
              <select value={voice} onChange={(e) => setVoice(e.target.value as "leo" | "fabio")}>
                <option value="fabio">Edge TTS · Fabio (Grátis · +16% ritmo, +6Hz tom jovem)</option>
                <option value="leo">Speko · Leo (xAI · consome créditos)</option>
              </select>
            </label>
          </div>
          <label htmlFor="tts-text">Texto para narrar</label>
          <textarea
            id="tts-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            maxLength={5000}
            placeholder="Digite o texto que deseja transformar em áudio."
            style={{
              display: "block",
              width: "100%",
              resize: "vertical",
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "#fbfcfa",
              color: "var(--text)",
              font: "inherit",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          />
          <div className="form-footer">
            <p className="helper">
              {text.length.toLocaleString("pt-BR")}/5.000 caracteres · {voice === "fabio" ? "Edge TTS · pt-BR-FabioNeural (gratuito)" : "Speko · xAI · leo"}
            </p>
            <button className="primary" type="button" onClick={generate} disabled={loading || !text.trim()}>
              {loading ? "Gerando áudio…" : audioUrl ? "Gerar novamente" : "Gerar prévia"}
            </button>
          </div>

          {message && <p className="config-note" role="status">{message}</p>}

          {audioUrl && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--rule)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Prévia gerada</h2>
              <audio controls preload="metadata" src={audioUrl} style={{ display: "block", width: "100%" }}>
                Seu navegador não suporta reprodução de áudio.
              </audio>
              <div className="actions" style={{ marginTop: 13 }}>
                <a className="secondary" href={audioUrl} download={`${voice}-teste.${extension}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  Baixar áudio
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="helper" style={{ maxWidth: 900, marginTop: 16 }}>
        A chave do Speko é usada somente no servidor e não é enviada ao navegador. Cada geração consome os créditos correspondentes ao texto enviado.
      </p>
    </main>
  );
}
