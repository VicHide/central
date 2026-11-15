"use client";

import React, { useState } from "react";
import Link from "next/link";

type Motion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
type MediaKind = "image" | "video";

type SceneItem = {
  index: number;
  title: string;
  speech: string;
  searchQuery: string;
  mediaKind: MediaKind;
  motion: Motion;
  downloadedUrl?: string;
  downloadedKind?: MediaKind;
  audioUrl?: string;
};

type CandidateMedia = {
  source: string;
  kind: MediaKind;
  title: string;
  url: string;
  thumbnail: string;
  duration?: number;
  channel?: string;
  width?: number;
  height?: number;
};

export default function StudioPage() {
  const [briefing, setBriefing] = useState(
    "Crie um vídeo dinâmico comparando Satoru Gojo e Sukuna em Jujutsu Kaisen, com ritmo rápido, cenas épicas e humor pontual."
  );
  const [style, setStyle] = useState("Anime Essay");
  const [format, setFormat] = useState("YouTube 16:9 (-14 LUFS)");
  const [durationMin, setDurationMin] = useState(2);
  const [humorPct, setHumorPct] = useState(35);
  const [aiProvider, setAiProvider] = useState<"auto" | "gemini" | "openai" | "manual">("auto");
  const [manualJson, setManualJson] = useState("");
  const [voice, setVoice] = useState<"voicestudio" | "antonio" | "andrew" | "puck" | "fenrir">("voicestudio");
  const [voiceStudioUrl, setVoiceStudioUrl] = useState("http://127.0.0.1:3900");
  const [voiceStudioInstruct, setVoiceStudioInstruct] = useState("male, young adult, low pitch");
  const [voiceStudioVoiceId, setVoiceStudioVoiceId] = useState("");
  const [voiceStudioVoices, setVoiceStudioVoices] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const [projectTitle, setProjectTitle] = useState("");
  const [hookTop, setHookTop] = useState("");
  const [hookBottom, setHookBottom] = useState("");
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const [searchResults, setSearchResults] = useState<Record<number, CandidateMedia[]>>({});
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [audioLoadingIdx, setAudioLoadingIdx] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [clipStart, setClipStart] = useState<Record<number, number>>({});
  const [clipDuration, setClipDuration] = useState<Record<number, number>>({});
  const [logs, setLogs] = useState<Array<{ time: string; level: "info" | "ok" | "erro"; text: string }>>([]);

  const addLog = (level: "info" | "ok" | "erro", text: string) => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setLogs((prev) => [{ time, level, text }, ...prev].slice(0, 80));
  };

  const carregarVozesVoiceStudio = async () => {
    setLoadingVoices(true);
    addLog("info", `Buscando vozes do VoiceStudio em ${voiceStudioUrl}...`);
    try {
      const res = await fetch(`/api/tts/voices?url=${encodeURIComponent(voiceStudioUrl)}`);
      const data = await readJsonSafe(res);
      if (!res.ok || !data.ok) throw new Error(data.erro || "Falha ao listar vozes.");
      const list = (data.voices || []) as Array<{ id: string; name: string; type: string }>;
      setVoiceStudioVoices(list);
      if (list.length > 0 && !voiceStudioVoiceId) {
        const ptMale = list.find((v) => /pt|br|narrador|masc|male|jovem/i.test(v.name));
        setVoiceStudioVoiceId((ptMale || list[0]).id);
      }
      addLog("ok", `${list.length} voz(es) carregada(s) do VoiceStudio.`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro ao carregar vozes.";
      setStatusMsg(m);
      addLog("erro", m);
    } finally {
      setLoadingVoices(false);
    }
  };

  const readJsonSafe = async (res: Response) => {
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(raw.slice(0, 200) || `Erro HTTP ${res.status}`);
    }
  };

  const gerarStoryboard = async () => {
    setLoadingBoard(true);
    setStatusMsg("");
    addLog("info", `Gerando storyboard (${aiProvider}, ${style}, ${durationMin} min)...`);
    try {
      if (aiProvider === "manual") {
        const parsed = JSON.parse(manualJson);
        if (!Array.isArray(parsed?.scenes) || parsed.scenes.length === 0) {
          throw new Error("O JSON precisa conter o array 'scenes'.");
        }
        setProjectTitle(parsed.title || "Projeto Studio");
        setHookTop(parsed.hookTop || "");
        setHookBottom(parsed.hookBottom || "");
        setScenes(
          parsed.scenes.map((s: Partial<SceneItem>, idx: number) => ({
            index: s.index ?? idx + 1,
            title: s.title || `Cena ${idx + 1}`,
            speech: s.speech || "",
            searchQuery: s.searchQuery || parsed.title || "",
            mediaKind: s.mediaKind === "video" ? "video" : "image",
            motion: s.motion || "zoom-in",
          }))
        );
        setSearchResults({});
        setStatusMsg("Storyboard importado do JSON! Agora você pode buscar as mídias e testar a voz de cada cena.");
        addLog("ok", `JSON importado com ${parsed.scenes.length} cenas.`);
        return;
      }

      const res = await fetch("/api/studio/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing, style, format, durationMin, humorPct, aiProvider }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.erro || "Falha ao gerar storyboard.");
      setProjectTitle(data.title || "Projeto Studio");
      setHookTop(data.hookTop || "");
      setHookBottom(data.hookBottom || "");
      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
      setSearchResults({});
      setStatusMsg(data.aviso || "Storyboard gerado por cena. Agora você pode buscar mídias e testar a voz em cada cena.");
      if (data.aviso) addLog("erro", data.aviso);
      else addLog("ok", `Storyboard gerado via ${data.source || "ia"}${data.model ? ` (${data.model})` : ""} · ${data.scenes?.length ?? 0} cenas.`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro ao gerar storyboard.";
      setStatusMsg(m);
      addLog("erro", m);
    } finally {
      setLoadingBoard(false);
    }
  };

  const buscarMidiaCena = async (scene: SceneItem, kind: "image" | "video" | "both") => {
    setSearchingIdx(scene.index);
    setStatusMsg("");
    addLog("info", `Cena ${scene.index}: buscando "${scene.searchQuery}" (${kind})...`);
    try {
      const res = await fetch("/api/studio/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: scene.searchQuery, kind, limit: 6 }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.erro || "Erro na busca da cena.");
      const items = (data.items || []) as CandidateMedia[];
      setSearchResults((prev) => ({ ...prev, [scene.index]: items }));
      if (data.aviso) {
        setStatusMsg(data.aviso);
        addLog("erro", `Cena ${scene.index}: ${data.aviso}`);
      } else {
        addLog("ok", `Cena ${scene.index}: ${items.length} resultado(s) via ${data.runner || "python"}.`);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Falha ao buscar mídia da cena.";
      setStatusMsg(m);
      addLog("erro", `Cena ${scene.index} busca falhou: ${m}`);
    } finally {
      setSearchingIdx(null);
    }
  };

  const baixarMidiaCena = async (sceneIndex: number, item: CandidateMedia) => {
    setDownloadingUrl(item.url);
    setStatusMsg("");
    addLog("info", `Cena ${sceneIndex}: baixando ${item.kind} (${item.source})...`);
    try {
      const res = await fetch("/api/studio/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "download",
          url: item.url,
          kind: item.kind,
          projectSlug: projectTitle || "studio",
          sceneIndex,
          startSec: clipStart[sceneIndex] ?? 0,
          durationSec: clipDuration[sceneIndex] ?? 6,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.erro || "Falha ao baixar mídia.");
      setScenes((prev) =>
        prev.map((s) =>
          s.index === sceneIndex
            ? { ...s, downloadedUrl: data.publicUrl, downloadedKind: item.kind, mediaKind: item.kind }
            : s
        )
      );
      setStatusMsg(`Cena ${sceneIndex} salva em ${data.publicUrl}`);
      addLog("ok", `Cena ${sceneIndex}: salvo em ${data.publicUrl} (${Math.round((data.bytes || 0) / 1024)} KB) via ${data.runner || "fallback"}.`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro ao baixar mídia.";
      setStatusMsg(m);
      addLog("erro", `Cena ${sceneIndex} download falhou: ${m}`);
    } finally {
      setDownloadingUrl(null);
    }
  };

  const gerarAudioCena = async (scene: SceneItem) => {
    setAudioLoadingIdx(scene.index);
    setStatusMsg("");
    addLog("info", `Cena ${scene.index}: gerando voz (${voice})...`);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scene.speech,
          voice,
          ...(voice === "voicestudio"
            ? { voiceStudioUrl, voiceStudioInstruct, voiceStudioVoiceId }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || "Falha ao gerar áudio da cena.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setScenes((prev) => prev.map((s) => (s.index === scene.index ? { ...s, audioUrl: url } : s)));
      addLog("ok", `Cena ${scene.index}: áudio gerado (${Math.round(blob.size / 1024)} KB).`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro ao gerar áudio.";
      setStatusMsg(m);
      addLog("erro", `Cena ${scene.index} voz falhou: ${m}`);
    } finally {
      setAudioLoadingIdx(null);
    }
  };

  const updateScene = (index: number, patch: Partial<SceneItem>) => {
    setScenes((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)));
  };

  const renderizarVideo = async () => {
    setRendering(true);
    setStatusMsg("");
    addLog("info", `Iniciando renderização final (${scenes.length} cenas, voz: ${voice})...`);
    try {
      const res = await fetch("/api/studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle || "Projeto Studio",
          voice,
          useMusic: true,
          scenes: scenes.map((s, idx) => ({
            speech: s.speech,
            media: s.downloadedUrl ?? "",
            motion: s.motion,
            ...(idx === 0 ? { hookTop, hookBottom } : {}),
          })),
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.erro || "Falha ao iniciar renderização.");
      setStatusMsg(data.message || "Renderização iniciada!");
      addLog("ok", `Render iniciado (jobId: ${data.jobId || "-"}).`);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erro ao renderizar.";
      setStatusMsg(m);
      addLog("erro", `Render falhou: ${m}`);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--ground)" }}>
      <header className="topbar">
        <div className="crumb">
          <Link href="/" style={{ color: "var(--muted)" }}>Central Studio</Link>
          <span>/</span>
          <strong style={{ color: "var(--text)" }}>Produção com IA</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="frames-status completed">FFmpeg OK</span>
          <span className="frames-status">100% Gratuito · yt-dlp + Pan/Zoom</span>
          <Link className="secondary" href="/voz" style={{ display: "inline-flex", alignItems: "center" }}>
            Testar Voz
          </Link>
        </div>
      </header>

      <main className="workspace" style={{ display: "grid", gap: 24 }}>
        <section
          className="composer"
          style={{
            background: "linear-gradient(135deg, rgba(124,106,239,.14), rgba(18,21,30,.95))",
            borderColor: "rgba(124,106,239,.3)",
          }}
        >
          <span className="dashboard-kicker">DIREÇÃO CRIATIVA IA</span>
          <h1 style={{ marginBottom: 6 }}>Produção com IA</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Descreva o vídeo em linguagem natural. O Studio planeja o storyboard cena a cena, gera queries específicas para YouTube/imagens gratuitas e integra com o VoiceStudio.
          </p>
        </section>

        <section className="composer">
          <label style={{ marginBottom: 14 }}>
            Direção Criativa / Briefing
            <textarea
              rows={3}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Ex.: Crie um vídeo sobre os 10 momentos mais insanos de Jujutsu Kaisen com ritmo rápido e humor pontual."
            />
          </label>

          <div className="fields" style={{ marginTop: 14 }}>
            <label>
              Estilo / Gênero
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option>Anime Essay</option>
                <option>Comparação / Versus</option>
                <option>Curiosidades / Lore</option>
                <option>Top Ranking</option>
                <option>Storytelling Rápido</option>
              </select>
            </label>

            <label>
              Formato
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option>YouTube 16:9 (-14 LUFS)</option>
                <option>Shorts / Reels 9:16</option>
              </select>
            </label>

            <label>
              Duração (min)
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              />
            </label>

            <label>
              IA do Roteiro
              <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as typeof aiProvider)}>
                <option value="auto">Automático (Gemini → OpenAI)</option>
                <option value="gemini">Google Gemini (Grátis · mesma família do Antigravity)</option>
                <option value="openai">OpenAI (Configurada no .env.local)</option>
                <option value="manual">Colar JSON (Gerado aqui no chat · sem API)</option>
              </select>
            </label>

            <label>
              Voz / Motor TTS
              <select value={voice} onChange={(e) => setVoice(e.target.value as typeof voice)}>
                <option value="voicestudio">VoiceStudio (Local)</option>
                <option value="antonio">Edge TTS · Antonio (Grátis)</option>
                <option value="andrew">Edge TTS · Andrew (Grátis)</option>
                <option value="puck">Google Chirp 3 · Puck</option>
                <option value="fenrir">Google Chirp 3 · Fenrir</option>
              </select>
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: voice === "voicestudio" ? "1fr 1fr" : "1fr",
              gap: 16,
              marginTop: 16,
              alignItems: "center",
            }}
          >
            <label style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Intensidade de Humor</span>
                <strong style={{ color: "#c4b8ff" }}>{humorPct}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={humorPct}
                onChange={(e) => setHumorPct(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </label>

            {voice === "voicestudio" && (
              <>
                <label style={{ margin: 0 }}>
                  URL do VoiceStudio
                  <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                    <input
                      type="text"
                      value={voiceStudioUrl}
                      onChange={(e) => setVoiceStudioUrl(e.target.value)}
                      placeholder="http://127.0.0.1:3900"
                      style={{ marginTop: 0 }}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={carregarVozesVoiceStudio}
                      disabled={loadingVoices}
                    >
                      {loadingVoices ? "Buscando..." : "Carregar Vozes"}
                    </button>
                  </div>
                </label>
                {voiceStudioVoices.length > 0 ? (
                  <label style={{ margin: 0 }}>
                    Perfil / Voz no VoiceStudio
                    <select
                      value={voiceStudioVoiceId}
                      onChange={(e) => setVoiceStudioVoiceId(e.target.value)}
                    >
                      <option value="">Usar tags/padrão ({voiceStudioInstruct})</option>
                      {voiceStudioVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.type})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label style={{ margin: 0 }}>
                    Voz / Tags (OmniVoice)
                    <input
                      type="text"
                      value={voiceStudioInstruct}
                      onChange={(e) => setVoiceStudioInstruct(e.target.value)}
                      placeholder="male, young adult, low pitch"
                    />
                  </label>
                )}
              </>
            )}
          </div>

          {aiProvider === "manual" && (
            <label style={{ marginTop: 14 }}>
              Cole aqui o JSON do Storyboard (peça no chat do Antigravity e cole abaixo)
              <textarea
                rows={4}
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                placeholder='{ "title": "...", "hookTop": "...", "hookBottom": "...", "scenes": [ { "index": 1, "title": "...", "speech": "...", "searchQuery": "...", "mediaKind": "image", "motion": "zoom-in" } ] }'
              />
            </label>
          )}

          <div className="form-footer">
            <p className="helper">
              Pesquisa por cena 100% gratuita (DuckDuckGo/Wallhaven + yt-dlp). Sem custo de API de vídeo ou imagem.
            </p>
            <button className="primary" type="button" onClick={gerarStoryboard} disabled={loadingBoard || (aiProvider === "manual" ? !manualJson.trim() : !briefing.trim())}>
              {loadingBoard ? "Planejando Storyboard..." : "Gerar Direção & Storyboard"}
            </button>
          </div>

          {statusMsg && <p className="frames-message">{statusMsg}</p>}
        </section>

        {scenes.length > 0 && (
          <section className="composer">
            <div className="section-head" style={{ marginBottom: 18 }}>
              <div>
                <h2>Storyboard por Cena · {projectTitle}</h2>
                <p>
                  Gancho: <code>{hookTop}</code> / <code>{hookBottom}</code> · {scenes.length} cenas planejadas
                </p>
              </div>
              <button
                type="button"
                className="primary"
                disabled={rendering || scenes.some((s) => !s.downloadedUrl)}
                onClick={renderizarVideo}
              >
                {rendering ? "Iniciando render..." : "Renderizar Vídeo Final"}
              </button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {scenes.map((scene) => {
                const candidates = searchResults[scene.index] ?? [];
                return (
                  <div key={scene.index} className="comparison-scene">
                    <div className="comparison-scene-title">
                      <strong>
                        Cena {scene.index} · {scene.title}
                      </strong>
                      <span>
                        {scene.downloadedUrl ? `Mídia pronta (${scene.downloadedKind})` : "Sem mídia baixada"}
                      </span>
                    </div>

                    <div className="fields">
                      <label>
                        Narração / Legenda da Cena
                        <textarea
                          rows={2}
                          value={scene.speech}
                          onChange={(e) => updateScene(scene.index, { speech: e.target.value })}
                        />
                      </label>

                      <label>
                        Query de Pesquisa da Cena (Assunto específico)
                        <input
                          type="text"
                          value={scene.searchQuery}
                          onChange={(e) => updateScene(scene.index, { searchQuery: e.target.value })}
                        />
                      </label>

                      <label>
                        Movimento (Pan & Zoom)
                        <select
                          value={scene.motion}
                          onChange={(e) => updateScene(scene.index, { motion: e.target.value as Motion })}
                        >
                          <option value="zoom-in">Zoom In (aproximando)</option>
                          <option value="zoom-out">Zoom Out (afastando)</option>
                          <option value="pan-left">Pan Left (deslizando ←)</option>
                          <option value="pan-right">Pan Right (deslizando →)</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        className="secondary"
                        disabled={searchingIdx === scene.index}
                        onClick={() => buscarMidiaCena(scene, "both")}
                      >
                        {searchingIdx === scene.index ? "Buscando..." : "Buscar Imagens + Clipes"}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={searchingIdx === scene.index}
                        onClick={() => buscarMidiaCena(scene, "image")}
                      >
                        Só Imagens HD
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={searchingIdx === scene.index}
                        onClick={() => buscarMidiaCena(scene, "video")}
                      >
                        Só Clipes (yt-dlp)
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={audioLoadingIdx === scene.index}
                        onClick={() => gerarAudioCena(scene)}
                      >
                        {audioLoadingIdx === scene.index ? "Gerando Voz..." : "Testar Voz da Cena"}
                      </button>
                      {scene.audioUrl && (
                        <audio controls src={scene.audioUrl} style={{ height: 32, maxWidth: 260 }} />
                      )}
                    </div>

                    {scene.downloadedUrl && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 6 }}>
                        {scene.downloadedKind === "video" ? (
                          <video src={scene.downloadedUrl} controls style={{ width: 220, borderRadius: 8 }} />
                        ) : (
                          <img
                            src={scene.downloadedUrl}
                            alt={scene.title}
                            style={{ width: 220, height: 124, objectFit: "cover", borderRadius: 8 }}
                          />
                        )}
                        <span style={{ fontSize: 12, color: "var(--positive)" }}>
                          Salvo em <code>{scene.downloadedUrl}</code>
                        </span>
                      </div>
                    )}

                    {candidates.length > 0 && (
                      <div style={{ display: "grid", gap: 10, paddingTop: 8, borderTop: "1px solid var(--rule)" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "var(--muted)" }}>
                          <span>Recorte p/ vídeo: Início (s):</span>
                          <input
                            type="number"
                            min={0}
                            value={clipStart[scene.index] ?? 0}
                            onChange={(e) => setClipStart((p) => ({ ...p, [scene.index]: Number(e.target.value) }))}
                            style={{ width: 76, marginTop: 0, padding: "4px 8px", fontSize: 12 }}
                          />
                          <span>Duração (s):</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={clipDuration[scene.index] ?? 6}
                            onChange={(e) => setClipDuration((p) => ({ ...p, [scene.index]: Number(e.target.value) }))}
                            style={{ width: 76, marginTop: 0, padding: "4px 8px", fontSize: 12 }}
                          />
                        </div>
                        <div className="frames-grid">
                          {candidates.map((cand, cIdx) => (
                            <div key={`${cand.url}-${cIdx}`} className="frames-card" style={{ display: "grid", gap: 6, padding: 8 }}>
                              <img src={cand.thumbnail || cand.url} alt={cand.title} />
                              <span style={{ padding: 0 }}>
                                [{cand.source} · {cand.kind}] {cand.title}
                              </span>
                              <button
                                type="button"
                                className="primary"
                                style={{ minHeight: 28, fontSize: 11 }}
                                disabled={downloadingUrl === cand.url}
                                onClick={() => baixarMidiaCena(scene.index, cand)}
                              >
                                {downloadingUrl === cand.url ? "Baixando..." : "Usar nesta cena"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="composer">
          <div className="section-head" style={{ marginBottom: 12 }}>
            <div>
              <h2>Log do Studio</h2>
              <p>Acompanhe em tempo real chamadas de IA, busca Python/yt-dlp, downloads e voz.</p>
            </div>
            <button type="button" className="secondary" onClick={() => setLogs([])} disabled={logs.length === 0}>
              Limpar log
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="empty-state" style={{ padding: "8px 0" }}>Nenhum evento registrado ainda.</p>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: 12,
                maxHeight: 240,
                overflow: "auto",
                borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--ground)",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              {logs.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    color:
                      entry.level === "erro"
                        ? "var(--negative)"
                        : entry.level === "ok"
                          ? "var(--positive)"
                          : "var(--muted)",
                  }}
                >
                  [{entry.time}] {entry.text}
                </div>
              ))}
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
