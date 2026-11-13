"use client";
import React, { useEffect, useState } from "react";
import { estimaDuracao, estimaDuracaoTop } from "@/config";
import { GENEROS, TEMPORADAS, ORDENS, TAGS, FORMATOS, SITUACOES, PAISES, DURACOES } from "@/core/generos";
import Image from "next/image";

type Meta = { n: number; render: boolean; duracaoSeg: number; resumo: string; preparo: string };
type Job = { id: string; titulo: string; status: "rodando" | "ok" | "erro"; inicio: number; fim?: number; log: string[]; etapa?: string; pct?: number; eta?: number; detalhe?: string; meta?: Meta };
type Acervo = { animes: { pasta: string; imagens: number; usadas: number }[]; promos: number };
type Saida = { nome: string; kb: number; data: number };
type Estado = { animes: number; promos: number; navegador: boolean; musicas: number };
type Faixa = { arquivo: string; titulo: string; artista?: string; credito?: string; volume?: number; ativa?: boolean };
type ComparacaoMedia = { arquivo: string; nome: string; tipo: "imagem" | "video"; bytes: number };
type ComparacaoCena = { label: string; active: "left" | "right" | "none"; speech: string; expression: "neutral" | "doubt" | "surprise" };


const buscar = async <T,>(url: string): Promise<T> => (await fetch(url, { cache: "no-store" })).json();
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const tempo = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
const segs = (j: Job) => Math.round(((j.fim ?? Date.now()) - j.inicio) / 1000);
const ROTULO = { rodando: "Em andamento", ok: "Concluído", erro: "Com erro" } as const;

// Converte a porcentagem geral do job nas etapas de produção.
function etapas(j: Job) {
  const r = j.meta?.render ?? false;
  const p = j.pct ?? 0;
  const ativa = j.status === "ok" ? 99 : !r || p < 10 ? 0 : p < 20 ? 1 : 2;
  const local = [r ? p * 10 : p, (p - 10) * 10, ((p - 20) / 80) * 100].map((v) => Math.max(0, Math.min(100, Math.round(v))));
  const base = [
    { nome: "Preparação", dono: j.meta?.preparo ?? "Sorteio, imagens e cortes" },
    { nome: "Empacotamento", dono: "Remotion · webpack" },
    { nome: "Renderização", dono: "Remotion · navegador interno" },
  ];
  return base.slice(0, r ? 3 : 1).map((e, i) => {
    const feito = ativa > i;
    const atual = ativa === i;
    const pct = feito ? 100 : atual ? local[i] : null;
    const detalhe = feito ? "Concluído" : atual
      ? [j.status === "erro" ? "Interrompido nesta etapa" : j.detalhe ?? j.etapa, i === 2 && j.status === "rodando" && j.eta !== undefined ? `faltam ~${tempo(j.eta)}` : ""].filter(Boolean).join(" · ")
      : "Aguardando";
    return { ...e, pct, detalhe };
  });
}

export default function Page() {
  const [modo, setModo] = useState<"zoom" | "quatro" | "comparacao">("zoom");
  const [n, setN] = useState(10);
  const [cortes, setCortes] = useState(1);
  const [seed, setSeed] = useState("");
  const [render, setRender] = useState(false);
  const [msg, setMsg] = useState("");
  const [tGenero, setTGenero] = useState("");
  const [tOrdem, setTOrdem] = useState("score");
  const [tTemporada, setTTemporada] = useState("");
  const [tAno, setTAno] = useState(String(new Date().getFullYear()));
  const [tN, setTN] = useState(10);
  const [tRender, setTRender] = useState(false);
  const [tMsg, setTMsg] = useState("");
  const [fil, setFil] = useState({ tag: "", formato: "", situacao: "", pais: "", duracao: "", de: "", ate: "", notaMin: "" });
  const [musica, setMusica] = useState(true);
  const setF = (k: keyof typeof fil) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setFil({ ...fil, [k]: e.target.value });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [acervo, setAcervo] = useState<Acervo>({ animes: [], promos: 0 });
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [estado, setEstado] = useState<Estado>({ animes: 0, promos: 0, navegador: false, musicas: 0 });
  const [tipoTags, setTipoTags] = useState<"quiz" | "top">("top");
  const [tags, setTags] = useState("");
  const [tagsMsg, setTagsMsg] = useState("");
  const [tagsLoading, setTagsLoading] = useState(false);
  const [thumbs, setThumbs] = useState<{ centro: string; lateral: string }>({ centro: "", lateral: "" });
  const [thumbSeta, setThumbSeta] = useState(true);
  const [thumbTema, setThumbTema] = useState("");
  const [thumbMsg, setThumbMsg] = useState("");
  const [thumbLoading, setThumbLoading] = useState(false);
  const [topThumbUrl, setTopThumbUrl] = useState("");
  const [topThumbMsg, setTopThumbMsg] = useState("");
  const [topThumbLoading, setTopThumbLoading] = useState(false);
  const [topThumbRank, setTopThumbRank] = useState("1");
  const [topThumbChamada, setTopThumbChamada] = useState("ANIMES MAIS ASSISTIDOS NO MUNDO");
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [musicaArquivo, setMusicaArquivo] = useState<File | null>(null);
  const [musicaTitulo, setMusicaTitulo] = useState("");
  const [musicaArtista, setMusicaArtista] = useState("");
  const [musicaCredito, setMusicaCredito] = useState("");
  const [musicaVolume, setMusicaVolume] = useState("0.18");
  const [musicaMsg, setMusicaMsg] = useState("");
  const [musicaLoading, setMusicaLoading] = useState(false);
  const [compTitulo, setCompTitulo] = useState("");
  const [compLabelEsq, setCompLabelEsq] = useState("");
  const [compLabelDir, setCompLabelDir] = useState("");
  const [compContextoEsq, setCompContextoEsq] = useState("");
  const [compContextoDir, setCompContextoDir] = useState("");
  const [compMediaEsq, setCompMediaEsq] = useState<ComparacaoMedia | null>(null);
  const [compMediaDir, setCompMediaDir] = useState<ComparacaoMedia | null>(null);
  const [compUpload, setCompUpload] = useState<"left" | "right" | null>(null);
  const [compCenas, setCompCenas] = useState<ComparacaoCena[]>([]);
  const [compMsg, setCompMsg] = useState("");
  const [compLoading, setCompLoading] = useState(false);

  const carregaMusicas = async () => {
    try { const d = await buscar<{ faixas: Faixa[] }>("/api/musicas"); setFaixas(d.faixas ?? []); }
    catch { /* catálogo indisponível */ }
  };
  const enviaMusica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicaArquivo) { setMusicaMsg("Selecione um arquivo de áudio."); return; }
    setMusicaLoading(true); setMusicaMsg("");
    try {
      const fd = new FormData();
      fd.set("arquivo", musicaArquivo); fd.set("titulo", musicaTitulo); fd.set("artista", musicaArtista);
      fd.set("credito", musicaCredito); fd.set("volume", musicaVolume);
      const r = await fetch("/api/musicas", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? "Não foi possível enviar a música.");
      setMusicaMsg("Música enviada e cadastrada no catálogo.");
      setMusicaArquivo(null); setMusicaTitulo(""); setMusicaArtista(""); setMusicaCredito(""); setMusicaVolume("0.18");
      const input = document.getElementById("arquivo-musica") as HTMLInputElement | null; if (input) input.value = "";
      await Promise.all([carregaMusicas(), carrega()]);
    } catch (err) { setMusicaMsg(err instanceof Error ? err.message : "Erro ao enviar."); }
    finally { setMusicaLoading(false); }
  };
  const alternaMusica = async (faixa: Faixa) => {
    const r = await fetch("/api/musicas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: faixa.arquivo, ativa: faixa.ativa === false }) });
    const d = await r.json(); if (!r.ok) { setMusicaMsg(d.erro ?? "Falha ao atualizar."); return; }
    setFaixas(d.faixas); carrega();
  };
  const excluiMusica = async (faixa: Faixa) => {
    if (!window.confirm(`Excluir "${faixa.titulo}" do catálogo e apagar o arquivo?`)) return;
    const r = await fetch("/api/musicas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: faixa.arquivo }) });
    const d = await r.json(); if (!r.ok) { setMusicaMsg(d.erro ?? "Falha ao excluir."); return; }
    setFaixas((atual) => atual.filter((f) => f.arquivo !== faixa.arquivo)); setMusicaMsg("Música excluída."); carrega();
  };

  const carrega = async () => {
    try {
      const [j, a, s, e] = await Promise.all([buscar<Job[]>("/api/jobs"), buscar<Acervo>("/api/acervo"), buscar<Saida[]>("/api/saidas"), buscar<Estado>("/api/status")]);
      setJobs(j); setAcervo(a); setSaidas(s); setEstado(e);
    } catch { /* servidor reiniciando */ }
  };
  useEffect(() => { carrega(); carregaMusicas(); const t = setInterval(() => { carrega(); carregaMusicas(); }, 3000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const j = jobs.find((x) => x.status === "rodando");
    document.title = j ? `${j.pct ?? 0}% · Central do Canal` : "Central do Canal";
  }, [jobs]);

  const gerar = async () => {
    setMsg("");
    const r = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo, n, cortes, seed: seed ? Number(seed) : undefined, render, musica }) });
    const d = await r.json();
    setMsg(r.ok ? "Tarefa iniciada. Acompanhe em Projetos." : d.erro ?? "Erro ao iniciar.");
    carrega();
  };
  const gerarTop = async () => {
    setTMsg("");
    const r = await fetch("/api/top", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      genero: tGenero || undefined, ordem: tOrdem, temporada: tTemporada || undefined, ano: tAno ? Number(tAno) : undefined, n: tN, render: tRender, musica,
      tag: fil.tag || undefined, formato: fil.formato || undefined, situacao: fil.situacao || undefined, pais: fil.pais || undefined, duracao: fil.duracao || undefined,
      de: fil.de ? Number(fil.de) : undefined, ate: fil.ate ? Number(fil.ate) : undefined, notaMin: fil.notaMin ? Number(fil.notaMin) : undefined,
    }) });
    const d = await r.json();
    setTMsg(r.ok ? "Tarefa iniciada. Acompanhe em Projetos." : d.erro ?? "Erro ao iniciar.");
    carrega();
  };
  const gerarTags = async () => {
    setTagsLoading(true); setTagsMsg(""); setTags("");
    try {
      const r = await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: tipoTags }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? "Não foi possível gerar as tags.");
      setTags(d.tags); setTagsMsg(`${d.quantidade} tags · ${d.caracteres}/500 caracteres`);
    } catch (e) { setTagsMsg(e instanceof Error ? e.message : "Erro ao gerar tags."); }
    finally { setTagsLoading(false); }
  };
  const copiarTags = async () => {
    try { await navigator.clipboard.writeText(tags); setTagsMsg("Tags copiadas para a área de transferência."); }
    catch { setTagsMsg("Não foi possível copiar automaticamente. Selecione e copie o texto."); }
  };
  const gerarThumbnail = async () => {
    setThumbLoading(true); setThumbMsg("");
    try {
      const corpo = JSON.stringify({ seta: thumbSeta, tema: thumbTema.trim() || undefined });
      const pedir = (layout: "centro" | "lateral") => fetch("/api/thumbnail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(corpo), layout }) });
      const [rc, rl] = await Promise.all([pedir("centro"), pedir("lateral")]);
      for (const r of [rc, rl]) {
        if (!r.ok) { const d = await r.json(); throw new Error(d.erro ?? "Não foi possível gerar a thumbnail."); }
      }
      const [bc, bl] = await Promise.all([rc.blob(), rl.blob()]);
      setThumbs((anterior) => {
        if (anterior.centro) URL.revokeObjectURL(anterior.centro);
        if (anterior.lateral) URL.revokeObjectURL(anterior.lateral);
        return { centro: URL.createObjectURL(bc), lateral: URL.createObjectURL(bl) };
      });
      setThumbMsg("Duas opções geradas. Você pode sortear outras ou baixar a que preferir.");
    } catch (e) { setThumbMsg(e instanceof Error ? e.message : "Erro ao gerar thumbnail."); }
    finally { setThumbLoading(false); }
  };


  const gerarThumbnailTop = async () => {
    setTopThumbLoading(true); setTopThumbMsg("");
    try {
      const r = await fetch("/api/thumbnail/top10", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: Number(topThumbRank), chamada: topThumbChamada }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.erro ?? "Não foi possível gerar a thumbnail do Top 10.");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setTopThumbUrl((anterior) => { if (anterior) URL.revokeObjectURL(anterior); return url; });
      setTopThumbMsg("Thumbnail vertical gerada. Confira a prévia e salve o PNG.");
    } catch (e) { setTopThumbMsg(e instanceof Error ? e.message : "Erro ao gerar thumbnail do Top 10."); }
    finally { setTopThumbLoading(false); }
  };

  const enviaMidiaComparacao = async (lado: "left" | "right", arquivo?: File) => {
    if (!arquivo) return;
    setCompUpload(lado); setCompMsg("");
    try {
      const form = new FormData();
      form.set("arquivo", arquivo);
      const r = await fetch("/api/comparacao/upload", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? "Não foi possível enviar o arquivo.");
      const media: ComparacaoMedia = d;
      if (lado === "left") setCompMediaEsq(media); else setCompMediaDir(media);
      setCompMsg(`${arquivo.name} enviado.`);
    } catch (e) {
      setCompMsg(e instanceof Error ? e.message : "Erro ao enviar o arquivo.");
    } finally {
      setCompUpload(null);
    }
  };

  const gerarRoteiroComparacao = async () => {
    setCompLoading(true); setCompMsg("");
    try {
      const r = await fetch("/api/comparacao/roteiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: compTitulo, leftLabel: compLabelEsq, rightLabel: compLabelDir,
          leftContext: compContextoEsq, rightContext: compContextoDir,
          leftMedia: compMediaEsq?.arquivo, rightMedia: compMediaDir?.arquivo,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro ?? "Não foi possível gerar o roteiro.");
      setCompTitulo(d.title || compTitulo);
      setCompCenas(d.scenes ?? []);
      setCompMsg("Roteiro gerado. Revise e edite as falas antes de continuar.");
    } catch (e) {
      setCompMsg(e instanceof Error ? e.message : "Erro ao gerar o roteiro.");
    } finally {
      setCompLoading(false);
    }
  };

  const atualizaCenaComparacao = (index: number, campo: keyof ComparacaoCena, valor: string) => {
    setCompCenas((atual) => atual.map((cena, i) => i === index ? { ...cena, [campo]: valor } as ComparacaoCena : cena));
  };

  const studio = async () => {
    const d = await (await fetch("/api/studio", { method: "POST" })).json();
    setTimeout(() => window.open(d.url, "_blank"), 2500);
  };

  const rodando = jobs.some((j) => j.status === "rodando");
  const falta = estado.animes < n;
  const duracao = modo === "comparacao" ? 0 : estimaDuracao(modo, n, cortes);

  return (
    <>
      <aside className="sidebar" aria-label="Navegação">
        <a className="brand" href="#novo"><span className="mark" aria-hidden="true">Q</span><span><strong>Central do Canal</strong><small>Estúdio de quiz</small></span></a>
        <nav>
          <a className="nav-link active" href="#novo">Novo vídeo</a>
          <a className="nav-link" href="#top">Top 10 (Short)</a>
          <a className="nav-link" href="#projetos">Produção</a>
          <a className="nav-link" href="#acervo">Acervo</a>
          <a className="nav-link" href="#musicas">Músicas</a>
          <a className="nav-link" href="#thumbnail">Thumbnails</a>
          <a className="nav-link" href="#saidas">Saídas</a>
          <a className="nav-link" href="/fancaps">FanCaps Downloader</a>
          <a className="nav-link" href="/frames">Detector de frames</a>
        </nav>
        <div className="sidebar-note"><span className="note-mark" aria-hidden="true" /><p>Um zoom.<br />Uma revelação.</p></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Central do Canal <span>/</span> Produção</div>
          <div className={`top-status ${estado.animes > 0 ? "ready" : "warn"}`} aria-live="polite">
            {estado.animes > 0 ? `Acervo pronto · ${estado.animes} animes · ${estado.promos} promos` : "Acervo vazio: adicione pastas em acervo/"}
            {" · "}{estado.musicas > 0 ? `${estado.musicas} faixa(s) de música` : "sem música (veja data/musicas.json)"}{" · "}{estado.navegador ? "navegador do Remotion instalado" : "navegador baixa no 1º render"}
          </div>
        </header>

        <section className="workspace">
          <div className="intro-row" id="novo">
            <div>
              <h1>Do acervo ao vídeo.</h1>
              <p>As pastas viram perguntas, a abertura entra sozinha e o vídeo sai pronto para conferir.</p>
            </div>
            <div className="duration-mark"><span>Duração estimada</span><b>{modo === "comparacao" ? "pela narração" : mmss(duracao)}</b></div>
          </div>

          <div className="work-grid">
            <section className="composer">
              <div className="section-head"><div><h2>Novo vídeo</h2><p>{modo === "comparacao" ? "Compare dois elementos e monte um roteiro com narração." : "Escolha o formato e quantos animes entram. O sorteio prefere o que foi menos usado."}</p></div><span className="step-label">{modo === "comparacao" ? "Comparação" : "Quiz de anime"}</span></div>
              <div className="form-body" style={{ marginTop: 24 }}>
                <div className="fields">
                  <label>Formato
                    <select value={modo} onChange={(e) => setModo(e.target.value as "zoom" | "quatro" | "comparacao")}>
                      <option value="zoom">Zoom e revelação</option>
                      <option value="quatro">4 imagens com dicas</option>\n                      <option value="comparacao">Comparação</option>
                    </select>
                  </label>
                  {modo !== "comparacao" && <>\n                    <label>Animes<input type="number" min={1} max={100} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
                    {modo === "zoom" && <label>Cortes de zoom<input type="number" min={1} max={6} value={cortes} onChange={(e) => setCortes(Number(e.target.value))} /></label>}
                    <label>Seed (opcional)<input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="aleatória" /></label>
                  </div>
                  <label className="check"><input type="checkbox" checked={render} onChange={(e) => setRender(e.target.checked)} /> Renderizar o vídeo ao terminar</label>
                  <label className="check"><input type="checkbox" checked={musica} onChange={(e) => setMusica(e.target.checked)} /> Música de fundo ({estado.musicas} faixa(s) disponível(is))</label>
                  <div className="form-footer">
                    <p className="helper">Sem renderizar, o painel só prepara os dados e as imagens. Dá para conferir no Remotion Studio antes.</p>
                    <div className="actions">
                      <button className="secondary" onClick={studio}>Abrir Remotion Studio</button>
                      <button className="primary" onClick={gerar} disabled={rodando}>{rodando ? "Aguarde…" : "Gerar projeto"}</button>
                    </div>
                  </div>
                  {falta && <p className="config-note">O acervo tem {estado.animes} pasta(s) com imagens e você pediu {n}.</p>}
                  {msg && <p className="config-note" style={{ color: "var(--muted)" }}>{msg}</p>}\n                  </>}
              </div>
            </section>
          </div>

          {modo === "comparacao" && (\n            <section className="composer comparison-composer" id="comparacao" style={{ marginTop: 14 }}>
              <div className="section-head">
                <div><h2>Vídeo de comparação</h2><p>Envie os dois quadros e gere um roteiro narrado para revisar no painel.</p></div>
                <span className="step-label">IA · Comparação</span>
              </div>
              <div className="form-body comparison-form">
                <div className="fields">
                  <label>Tema da comparação
                    <input type="text" value={compTitulo} onChange={(e) => setCompTitulo(e.target.value)} placeholder="Ex.: Mangekyou vs. Eternal Mangekyou" />
                  </label>
                  <label>Nome do quadro esquerdo
                    <input type="text" value={compLabelEsq} onChange={(e) => setCompLabelEsq(e.target.value)} placeholder="Ex.: Mangekyou" />
                  </label>
                  <label>Nome do quadro direito
                    <input type="text" value={compLabelDir} onChange={(e) => setCompLabelDir(e.target.value)} placeholder="Ex.: Eternal Mangekyou" />
                  </label>
                </div>
                <div className="comparison-media-grid">
                  <div className="comparison-media">
                    <strong>Quadro 1 · Esquerdo</strong>
                    {compMediaEsq ? <div className="comparison-file">
                      {compMediaEsq.tipo === "imagem" ? <img src={"/" + compMediaEsq.arquivo} alt="Prévia do quadro esquerdo" /> : <div className="comparison-video-file">Vídeo enviado</div>}
                      <span>{compMediaEsq.nome}</span>
                      <button type="button" className="secondary" onClick={() => setCompMediaEsq(null)}>Remover</button>
                    </div> : <label className="comparison-upload">
                      <span>＋</span><b>Enviar imagem ou vídeo</b><small>JPG, PNG, WebP, MP4, WebM ou MOV · até 80 MB</small>
                      <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => enviaMidiaComparacao("left", e.target.files?.[0])} disabled={compUpload !== null} />
                    </label>}
                    <label>Contexto adicional
                      <textarea value={compContextoEsq} onChange={(e) => setCompContextoEsq(e.target.value)} rows={3} placeholder="Explique detalhes importantes que a imagem não mostra." />
                    </label>
                  </div>
                  <div className="comparison-media">
                    <strong>Quadro 2 · Direito</strong>
                    {compMediaDir ? <div className="comparison-file">
                      {compMediaDir.tipo === "imagem" ? <img src={"/" + compMediaDir.arquivo} alt="Prévia do quadro direito" /> : <div className="comparison-video-file">Vídeo enviado</div>}
                      <span>{compMediaDir.nome}</span>
                      <button type="button" className="secondary" onClick={() => setCompMediaDir(null)}>Remover</button>
                    </div> : <label className="comparison-upload">
                      <span>＋</span><b>Enviar imagem ou vídeo</b><small>JPG, PNG, WebP, MP4, WebM ou MOV · até 80 MB</small>
                      <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => enviaMidiaComparacao("right", e.target.files?.[0])} disabled={compUpload !== null} />
                    </label>}
                    <label>Contexto adicional
                      <textarea value={compContextoDir} onChange={(e) => setCompContextoDir(e.target.value)} rows={3} placeholder="Explique detalhes importantes que a imagem não mostra." />
                    </label>
                  </div>
                </div>
                <div className="comparison-actions">
                  <p className="helper">A IA cria cinco cenas: abertura, apresentação de cada quadro, comparação e pergunta final. Você poderá editar todas as falas.</p>
                  <button className="primary" onClick={gerarRoteiroComparacao} disabled={compLoading || compUpload !== null}>
                    {compLoading ? "Gerando roteiro…" : "Gerar roteiro com IA"}
                  </button>
                </div>
                {compMsg && <p className="config-note" role="status">{compMsg}</p>}
                {compCenas.length > 0 && <div className="comparison-scenes">
                  <div className="comparison-scenes-heading"><h3>Roteiro gerado</h3><span>{compCenas.length} cenas · editável</span></div>
                  {compCenas.map((cena, index) => <div className="comparison-scene" key={index}>
                    <div className="comparison-scene-title"><strong>Cena {index + 1}</strong><span>{cena.label}</span></div>
                    <div className="fields">
                      <label>Foco
                        <select value={cena.active} onChange={(e) => atualizaCenaComparacao(index, "active", e.target.value)}>
                          <option value="none">Os dois quadros</option><option value="left">Quadro esquerdo</option><option value="right">Quadro direito</option>
                        </select>
                      </label>
                      <label>Expressão do mascote
                        <select value={cena.expression} onChange={(e) => atualizaCenaComparacao(index, "expression", e.target.value)}>
                          <option value="neutral">Neutra</option><option value="doubt">Dúvida</option><option value="surprise">Surpresa</option>
                        </select>
                      </label>
                    </div>
                    <label>Texto da narração
                      <textarea value={cena.speech} onChange={(e) => atualizaCenaComparacao(index, "speech", e.target.value)} rows={3} />
                    </label>
                  </div>)}
                  <p className="helper">A revisão do roteiro está pronta. A próxima etapa é conectar a voz e o render à fila de produção.</p>
                </div>}
              </div>
            </section>\n          )}\n\n          <section className="composer" id="top" style={{ marginTop: 14 }}>
            <div className="section-head"><div><h2>Top 10 para Shorts</h2><p>Ranking do AniList por gênero, temporada ou popularidade, com capas oficiais e contagem regressiva.</p></div><span className="step-label">AniList</span></div>
            <div className="form-body" style={{ marginTop: 24 }}>
              <div className="fields">
                <label>Critério
                  <select value={tOrdem} onChange={(e) => setTOrdem(e.target.value)}>{ORDENS.map((o) => <option key={o.id} value={o.id}>{o.pt}</option>)}</select>
                </label>
                <label>Gênero
                  <select value={tGenero} onChange={(e) => setTGenero(e.target.value)}><option value="">Todos</option>{GENEROS.map((g) => <option key={g.slug} value={g.slug}>{g.pt}</option>)}</select>
                </label>
                <label>Temporada
                  <select value={tTemporada} onChange={(e) => setTTemporada(e.target.value)}><option value="">Qualquer</option>{TEMPORADAS.map((s) => <option key={s.id} value={s.id}>{s.pt}</option>)}</select>
                </label>
                <label>Ano<input type="number" min={1980} max={2100} value={tAno} onChange={(e) => setTAno(e.target.value)} placeholder="qualquer" /></label>
                <label>Quantidade<input type="number" min={3} max={10} value={tN} onChange={(e) => setTN(Number(e.target.value))} /></label>
              </div>
              <details className="avancado">
                <summary>Filtros avançados</summary>
                <div className="fields" style={{ marginTop: 14 }}>
                  <label>Tag<select value={fil.tag} onChange={setF("tag")}><option value="">Qualquer</option>{TAGS.map((x) => <option key={x.slug} value={x.slug}>{x.pt}</option>)}</select></label>
                  <label>Formato<select value={fil.formato} onChange={setF("formato")}><option value="">Todos</option>{FORMATOS.map((x) => <option key={x.slug} value={x.slug}>{x.pt}</option>)}</select></label>
                  <label>Situação<select value={fil.situacao} onChange={setF("situacao")}><option value="">Qualquer</option>{SITUACOES.map((x) => <option key={x.slug} value={x.slug}>{x.pt}</option>)}</select></label>
                  <label>País de origem<select value={fil.pais} onChange={setF("pais")}><option value="">Qualquer</option>{PAISES.map((x) => <option key={x.slug} value={x.slug}>{x.pt}</option>)}</select></label>
                  <label>Duração<select value={fil.duracao} onChange={setF("duracao")}><option value="">Qualquer</option>{DURACOES.map((x) => <option key={x.slug} value={x.slug}>{x.pt}</option>)}</select></label>
                  <label>Estreou de (ano)<input type="number" min={1960} max={2100} value={fil.de} onChange={setF("de")} placeholder="qualquer" /></label>
                  <label>Até (ano)<input type="number" min={1960} max={2100} value={fil.ate} onChange={setF("ate")} placeholder="qualquer" /></label>
                  <label>Nota mínima (0 a 100)<input type="number" min={0} max={100} value={fil.notaMin} onChange={setF("notaMin")} placeholder="sem mínimo" /></label>
                </div>
              </details>
              <label className="check"><input type="checkbox" checked={musica} onChange={(e) => setMusica(e.target.checked)} /> Música de fundo ({estado.musicas} faixa(s) disponível(is))</label>
              <label className="check"><input type="checkbox" checked={tRender} onChange={(e) => setTRender(e.target.checked)} /> Renderizar o Short ao terminar</label>
              <div className="form-footer">
                <p className="helper">Duração estimada: {mmss(estimaDuracaoTop(tN))}. Sem temporada, o ano filtra só pelo ano de estreia. Nada é publicado sozinho.</p>
                <div className="actions"><button className="primary" onClick={gerarTop} disabled={rodando}>{rodando ? "Aguarde…" : "Gerar Top"}</button></div>
              </div>
              {tMsg && <p className="config-note" style={{ color: "var(--muted)" }}>{tMsg}</p>}
            </div>
          </section>

          <section className="jobs-section" id="projetos">
            <div className="jobs-heading"><div><h2>Gerenciador de produção</h2><p>Execuções atuais e histórico local, preservado mesmo após reiniciar o painel. Atualização a cada 3 segundos.</p></div><span className="job-count">{jobs.filter((j) => j.status === "rodando").length} em andamento · {jobs.filter((j) => j.status === "ok").length} concluídas · {jobs.filter((j) => j.status === "erro").length} com erro</span></div>
            <div className="jobs-list">
              {jobs.length === 0 && <p className="empty-state">Nenhuma tarefa ainda. Gere o primeiro projeto acima.</p>}
              {jobs.map((j, i) => (
                <div className="job" key={j.id}>
                  <div className="job-row">
                    <div>
                      <div className="job-topic">{j.titulo}</div>
                      {j.meta && <div className="job-meta">{j.meta.resumo} · ~{mmss(j.meta.duracaoSeg)} de vídeo{j.meta.render ? " · com render" : ""}</div>}
                    </div>
                    <div className="job-stage">{j.etapa ?? "Iniciando"}{j.pct !== undefined ? ` · ${j.pct}%` : ""}</div>
                    <div className="job-state"><span className={`state-dot ${j.status}`} />{ROTULO[j.status]} · {segs(j)} s</div>
                  </div>
                  <div className="production-stages">
                    {etapas(j).map((e) => (
                      <section className="production-stage" key={e.nome}>
                        <div className="stage-heading"><h3>{e.nome}</h3><span className="stage-percent">{e.pct === null ? "Aguardando" : `${e.pct}%`}</span></div>
                        <p className="stage-owner">{e.dono}</p>
                        <progress max={100} value={e.pct ?? 0} aria-label={e.nome} />
                        <p className="stage-detail">{e.detalhe}</p>
                      </section>
                    ))}
                  </div>
                  {j.log.length > 0 && <details className="log" open={i === 0 && j.status === "erro"}><summary>Registro</summary><pre>{j.log.join("\n")}</pre></details>}
                </div>
              ))}
            </div>
          </section>

          <section className="jobs-section" id="acervo">
            <div className="jobs-heading"><div><h2>Acervo</h2><p>{acervo.animes.length} animes · {acervo.promos} imagens em promos/. Adicione pastas em acervo/ no seu computador.</p></div></div>
            {acervo.animes.length > 0 && (
              <table>
                <thead><tr><th>Pasta</th><th>Imagens</th><th>Já usadas</th></tr></thead>
                <tbody>{acervo.animes.map((a) => <tr key={a.pasta}><td>{a.pasta}</td><td>{a.imagens}</td><td>{a.usadas}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          <section className="music-library" id="musicas">
            <div className="music-heading"><div><span className="music-eyebrow">ACERVO DE ÁUDIO</span><h2>Biblioteca de músicas</h2><p>Organize as trilhas usadas na produção dos vídeos.</p></div><span className="music-total"><strong>{faixas.length}</strong><small>faixas no catálogo</small></span></div>
            <form className="music-form" onSubmit={enviaMusica}>
              <div className="music-fields">
                <label>Arquivo de áudio<input id="arquivo-musica" type="file" accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setMusicaArquivo(f); if (f && !musicaTitulo) setMusicaTitulo(f.name.replace(/\.[^.]+$/, "")); }} /></label>
                <label>Título<input value={musicaTitulo} onChange={(e) => setMusicaTitulo(e.target.value)} placeholder="Nome da faixa" /></label>
                <label>Artista<input value={musicaArtista} onChange={(e) => setMusicaArtista(e.target.value)} placeholder="Artista" /></label>
                <label>Volume (0 a 1)<input type="number" min="0" max="1" step="0.01" value={musicaVolume} onChange={(e) => setMusicaVolume(e.target.value)} /></label>
              </div>
              <label className="music-credit">Crédito para a descrição<textarea value={musicaCredito} onChange={(e) => setMusicaCredito(e.target.value)} rows={2} placeholder="Crédito/licença exigidos pelo autor da música"  /></label>
              <div className="form-footer"><p className="helper">MP3, WAV, OGG, M4A, AAC ou FLAC · até 80 MB. Confira os termos de uso e o crédito antes de publicar.</p><button className="primary" type="submit" disabled={musicaLoading || !musicaArquivo}>{musicaLoading ? "Enviando…" : "Enviar música"}</button></div>
              {musicaMsg && <p className="config-note" role="status">{musicaMsg}</p>}
            </form>
            <div className="jobs-list" style={{ marginTop: 18 }}>
              {faixas.length === 0 && <p className="empty-state">Nenhuma música cadastrada.</p>}
              {faixas.map((f) => <div className="job" key={f.arquivo}><div className="job-row"><div><div className="job-topic">{f.titulo}</div><div className="job-meta">{f.artista || f.arquivo} · volume {f.volume ?? 0.18}</div></div><div className="job-stage">{f.ativa === false ? "Desativada" : "Disponível para sorteio"}</div><div className="actions"><button className="secondary" type="button" onClick={() => alternaMusica(f)}>{f.ativa === false ? "Ativar" : "Desativar"}</button><button className="secondary" type="button" onClick={() => excluiMusica(f)}>Excluir</button></div></div></div>)}
            </div>
          </section>

          <section className="composer" id="thumbnail" style={{ marginTop: 14 }}>
            <div className="section-head"><div><h2>Gerador de thumbnails</h2><p>Sorteia quatro animes do último quiz e um personagem PNG, e gera duas opções: personagem no centro e personagem na lateral.</p></div><span className="step-label">1280 × 720</span></div>
            <div className="form-body" style={{ marginTop: 20 }}>
              <div className="fields">
                <label>Tema no título (opcional)<input value={thumbTema} maxLength={18} onChange={(e) => setThumbTema(e.target.value)} placeholder="ex.: OLHOS" /></label>
              </div>
              <label className="check"><input type="checkbox" checked={thumbSeta} onChange={(e) => setThumbSeta(e.target.checked)} /> Seta apontando para um quadro</label>
              <div className="form-footer">
                <p className="helper">Usa as imagens de public/gerado/ e os PNGs de acervo/pngs. PNG com o cabelo cortado no topo combina com a opção lateral.</p>
                <div className="actions"><button className="secondary" onClick={gerarThumbnail} disabled={thumbLoading}>{thumbLoading ? "Gerando…" : thumbs.centro ? "Sortear outras" : "Gerar thumbnails"}</button></div>
              </div>
              {(thumbs.centro || thumbs.lateral) && <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
                {([["centro", "Personagem no centro"], ["lateral", "Personagem na lateral"]] as const).map(([chave, rotulo]) => thumbs[chave] && (
                  <div key={chave}>
                    <Image src={thumbs[chave]} alt={`Prévia: ${rotulo}`} width={1280} height={720} unoptimized style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, border: "1px solid var(--border)" }} />
                    <div className="actions" style={{ marginTop: 10, alignItems: "center", gap: 12 }}>
                      <span className="mut">{rotulo}</span>
                      <a className="secondary" href={thumbs[chave]} download={`thumbnail-${chave}.png`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Baixar PNG</a>
                    </div>
                  </div>
                ))}
              </div>}
              {thumbMsg && <p className="config-note" style={{ color: "var(--muted)" }}>{thumbMsg}</p>}
            </div>
          </section>

          <section className="composer" id="thumbnail-top10" style={{ marginTop: 14 }}>
            <div className="section-head">
              <div><h2>Thumbnail · Top 10 Shorts</h2><p>Cria uma arte vertical a partir das capas do último ranking gerado.</p></div>
              <span className="step-label">1080 × 1920 · 9:16</span>
            </div>
            <div className="form-body" style={{ marginTop: 20 }}>
              <div className="fields">
                <label>Capa de fundo
                  <select value={topThumbRank} onChange={(e) => setTopThumbRank(e.target.value)}>
                    {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={String(i + 1)}>Capa {i + 1}</option>)}
                  </select>
                </label>
                <label>Chamada principal
                  <input value={topThumbChamada} maxLength={90} onChange={(e) => setTopThumbChamada(e.target.value)} placeholder="ANIMES MAIS ASSISTIDOS NO MUNDO" />
                </label>
              </div>
              <div className="form-footer">
                <p className="helper">Escolha qual capa será usada como imagem de fundo. O número serve apenas para selecionar a capa e não aparece na arte.</p>
                <div className="actions">
                  <button className="primary" onClick={gerarThumbnailTop} disabled={topThumbLoading}>{topThumbLoading ? "Montando thumbnail…" : topThumbUrl ? "Gerar novamente" : "Gerar thumbnail vertical"}</button>
                </div>
              </div>
              {topThumbUrl && <div style={{ marginTop: 20 }}>
                <Image
                  src={topThumbUrl}
                  alt="Prévia da thumbnail vertical do Top 10"
                  width={1080}
                  height={1920}
                  unoptimized
                  style={{ display: "block", width: "100%", maxWidth: 420, height: "auto", borderRadius: 10, border: "1px solid var(--border)" }}
                />
                <div className="actions" style={{ marginTop: 12 }}>
                  <a className="secondary" href={topThumbUrl} download="thumbnail-top10-shorts.png" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Baixar PNG</a>
                </div>
              </div>}
              {topThumbMsg && <p className="config-note" style={{ color: "var(--muted)" }}>{topThumbMsg}</p>}
            </div>
          </section>

          <section className="composer" id="tags" style={{ marginTop: 14 }}>
            <div className="section-head"><div><h2>Tags para YouTube</h2><p>Gera tags com base nos animes, gêneros e informações do último projeto produzido.</p></div><span className="step-label">Publicação</span></div>
            <div className="form-body" style={{ marginTop: 20 }}>
              <div className="fields">
                <label>Tipo de vídeo
                  <select value={tipoTags} onChange={(e) => { setTipoTags(e.target.value as "quiz" | "top"); setTags(""); setTagsMsg(""); }}>
                    <option value="top">Top 10 / Top Short</option>
                    <option value="quiz">Quiz de animes (zoom ou 4 imagens)</option>
                  </select>
                </label>
              </div>
              <div className="form-footer">
                <p className="helper">As tags são sugeridas a partir dos dados já gerados. Confira antes de publicar; o painel não envia nada ao YouTube.</p>
                <div className="actions"><button className="primary" onClick={gerarTags} disabled={tagsLoading}>{tagsLoading ? "Gerando…" : "Gerar tags"}</button></div>
              </div>
              {tags && <label>Tags (separadas por vírgula)
                <textarea value={tags} readOnly rows={4} style={{ width: "100%", resize: "vertical" }} />
              </label>}
              {tags && <div className="actions"><button className="secondary" onClick={copiarTags}>Copiar tags</button></div>}
              {tagsMsg && <p className="config-note" style={{ color: "var(--muted)" }}>{tagsMsg}</p>}
            </div>
          </section>

          <section className="jobs-section" id="saidas">
            <div className="jobs-heading"><div><h2>Saídas</h2><p>Vídeos e textos de publicação em out/.</p></div></div>
            <div className="jobs-list">
              {saidas.length === 0 && <p className="empty-state">Nada em out/ ainda.</p>}
              {saidas.map((s) => (
                <div className="job" key={s.nome}><div className="job-row"><a className="link" href={`/api/saidas/${encodeURIComponent(s.nome)}`} target="_blank" rel="noreferrer">{s.nome}</a><span className="job-meta">{s.kb} KB</span><span className="job-state">{new Date(s.data).toLocaleString("pt-BR")}</span></div></div>
              ))}
            </div>
          </section>

          <footer className="footer"><span>Central do Canal</span><span>Roda só neste computador · nada é publicado automaticamente</span></footer>
        </section>
      </main>
    </>
  );
}
