"use client";

import { useCallback, useEffect, useState } from "react";

type AnimeFolder = { pasta: string; imagens: number; usadas: number };
type Snapshot = {
  status: "idle" | "running" | "completed" | "error";
  anime: string | null;
  total: number;
  processed: number;
  progress: number;
  selected: string[];
  discarded: string[];
  deleted_count: number;
  error: string | null;
};
const empty: Snapshot = { status: "idle", anime: null, total: 0, processed: 0, progress: 0, selected: [], discarded: [], deleted_count: 0, error: null };

function imageUrl(anime: string, file: string) {
  return "/api/acervo/imagem?anime=" + encodeURIComponent(anime) + "&arquivo=" + encodeURIComponent(file);
}

export default function FramesPage() {
  const [folders, setFolders] = useState<AnimeFolder[]>([]);
  const [anime, setAnime] = useState("");
  const [threshold, setThreshold] = useState(4);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"selected" | "discarded">("selected");

  const refresh = useCallback(async () => {
    try {
      const [a, f] = await Promise.all([
        fetch("/api/acervo", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/frames", { cache: "no-store" }).then(r => r.json()),
      ]);
      setFolders((a.animes || []).filter((x: AnimeFolder) => x.imagens > 0));
      setSnapshot(f);
      if (!anime && a.animes?.length) setAnime(a.animes.find((x: AnimeFolder) => x.imagens > 0)?.pasta || "");
    } catch { setMessage("Não foi possível consultar o acervo ou o serviço de análise."); }
  }, [anime]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (snapshot.status !== "running") return;
    const timer = window.setInterval(() => { void refresh(); }, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.status, refresh]);

  const analyze = async () => {
    if (!anime || loading || snapshot.status === "running") return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/frames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze", anime, threshold }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Não foi possível iniciar a análise.");
      setSnapshot(data); setTab("selected");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao iniciar análise."); }
    finally { setLoading(false); }
  };

  const deleteDiscarded = async () => {
    if (!anime || !snapshot.discarded.length) return;
    const ok = window.confirm("Excluir " + snapshot.discarded.length + " imagens redundantes da pasta " + anime + "? Os frames selecionados serão preservados. Essa ação não pode ser desfeita.");
    if (!ok) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/frames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", anime, confirmed: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Não foi possível excluir os arquivos.");
      setSnapshot(data); setMessage(data.deleted + " imagens redundantes excluídas.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao excluir imagens."); }
    finally { setLoading(false); }
  };

  const files = tab === "selected" ? snapshot.selected : snapshot.discarded;
  const selectedCount = snapshot.selected.length;
  const discardedCount = snapshot.discarded.length;
  const canDelete = snapshot.status === "completed" && snapshot.anime === anime && discardedCount > 0;

  return <main className="frames-workspace">
    <header className="frames-heading">
      <div><a className="frames-back" href="/">← Voltar à central</a><p className="frames-kicker">FERRAMENTAS DO ACERVO</p><h1>Detector de frames semelhantes</h1><p className="frames-lead">Encontre imagens quase repetidas com comparação perceptual. A análise não altera os arquivos.</p></div>
      <span className={"frames-status " + snapshot.status}>{snapshot.status === "running" ? "Analisando" : snapshot.status === "completed" ? "Análise concluída" : snapshot.status === "error" ? "Erro na análise" : "Pronto"}</span>
    </header>

    <section className="frames-settings">
      <div className="frames-field"><label htmlFor="frames-anime">Pasta do anime</label><select id="frames-anime" value={anime} onChange={e => { setAnime(e.target.value); setSnapshot(empty); setMessage(""); }}><option value="">Selecione uma pasta</option>{folders.map(f => <option key={f.pasta} value={f.pasta}>{f.pasta} · {f.imagens} imagens</option>)}</select></div>
      <div className="frames-field"><label htmlFor="frames-threshold">Sensibilidade <strong>{threshold}</strong></label><input id="frames-threshold" type="range" min="0" max="16" step="1" value={threshold} onChange={e => setThreshold(Number(e.target.value))} /><small>Menor = comparação mais rigorosa · maior = considera mais imagens semelhantes</small></div>
      <button className="frames-primary" onClick={analyze} disabled={!anime || loading || snapshot.status === "running"}>{snapshot.status === "running" ? "Analisando…" : "Analisar pasta"}</button>
    </section>

    {snapshot.status === "running" && <section className="frames-progress"><div><strong>Analisando imagens</strong><span>{snapshot.processed} / {snapshot.total} · {snapshot.progress}%</span></div><progress max={100} value={snapshot.progress}/></section>}
    {snapshot.status === "error" && <p className="frames-message error">{snapshot.error}</p>}
    {message && <p className="frames-message">{message}</p>}

    <section className="frames-results">
      <div className="frames-stats">
        <div><strong>{snapshot.total}</strong><span>Imagens analisadas</span></div>
        <div><strong>{selectedCount}</strong><span>Frames mantidos</span></div>
        <div><strong>{discardedCount}</strong><span>Possíveis redundantes</span></div>
      </div>
      <div className="frames-tabs">
        <button className={tab === "selected" ? "active" : ""} onClick={() => setTab("selected")}>Mantidos ({selectedCount})</button>
        <button className={tab === "discarded" ? "active" : ""} onClick={() => setTab("discarded")}>Semelhantes ({discardedCount})</button>
        <span>{snapshot.status === "completed" ? "Confira os resultados antes de qualquer exclusão." : "Execute uma análise para visualizar os frames."}</span>
      </div>
      {snapshot.status === "completed" && snapshot.anime === anime ? <div className="frames-grid">{files.map(file => <article className="frames-card" key={file}><img src={imageUrl(anime, file)} alt={file} loading="lazy"/><span title={file}>{file}</span></article>)}</div> : <div className="frames-empty">Selecione uma pasta e execute a análise para ver os resultados.</div>}
      {canDelete && <div className="frames-delete-row"><p>A exclusão remove somente os arquivos listados em “Semelhantes”.</p><button className="frames-danger" disabled={loading} onClick={deleteDiscarded}>Excluir {discardedCount} redundantes…</button></div>}
    </section>
  </main>;
}
